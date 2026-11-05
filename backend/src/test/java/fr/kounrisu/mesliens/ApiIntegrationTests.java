package fr.kounrisu.mesliens;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = {
        "mesliens.token=test-token-test-token-test-token-0000",
        "mesliens.screenshots.dir=target/test-screenshots",
        "mesliens.screenshots.max-bytes=1024",
        "mesliens.rate-limit.per-minute=100000",
        "mesliens.rate-limit.failed-auth-per-minute=100000"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class ApiIntegrationTests {

    static final String TOKEN = "test-token-test-token-test-token-0000";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    private MockHttpServletRequestBuilder authed(MockHttpServletRequestBuilder b) {
        return b.secure(true).header("X-Api-Token", TOKEN);
    }

    static String link(UUID id, String title, String updatedAt, String deletedAt) {
        return """
            {"id":"%s","url":"https://example.com/a","title":"%s","domain":"example.com","tags":["angular","veille"],
             "note":"n","screenshotId":null,"createdAt":"2026-11-01T10:00:00Z","updatedAt":"%s","deletedAt":%s}"""
                .formatted(id, title, updatedAt, deletedAt == null ? "null" : "\"" + deletedAt + "\"");
    }

    private void seed(UUID id, String json) throws Exception {
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    // ---- authentification ----

    @Test
    void sansJetonOuAvecMauvaisJeton_401() throws Exception {
        mvc.perform(get("/api/links").secure(true)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/links").secure(true).header("X-Api-Token", "mauvais")).andExpect(status().isUnauthorized());
        mvc.perform(authed(get("/api/links"))).andExpect(status().isOk());
    }

    @Test
    void httpEnClair_refuse() throws Exception {
        mvc.perform(get("/api/links").header("X-Api-Token", TOKEN)).andExpect(status().isForbidden());
    }

    // ---- liens ----

    @Test
    void creation_201_puis_relecture() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(id, "Premier", "2026-11-01T10:00:00Z", null)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.title").value("Premier"));
        mvc.perform(authed(get("/api/links/" + id)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.tags[1]").value("veille"));
    }

    @Test
    void leplusRecentGagne_ancienIgnore_recentRemplace() throws Exception {
        UUID id = UUID.randomUUID();
        seed(id, link(id, "v2", "2026-11-02T10:00:00Z", null));
        // version plus ancienne : ignorée, le serveur renvoie sa version
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(id, "v1-ancien", "2026-11-01T10:00:00Z", null)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("v2"));
        // même updatedAt : le serveur conserve (rejeu idempotent)
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(id, "v2-bis", "2026-11-02T10:00:00Z", null)))
                .andExpect(jsonPath("$.title").value("v2"));
        // plus récente : remplace
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(id, "v3", "2026-11-03T10:00:00Z", null)))
                .andExpect(jsonPath("$.title").value("v3"));
    }

    @Test
    void tombstoneRecentGagneContreEditionAncienne_etEditionRecenteRessuscite() throws Exception {
        UUID id = UUID.randomUUID();
        seed(id, link(id, "x", "2026-11-01T10:00:00Z", null));
        seed(id, link(id, "x", "2026-11-03T10:00:00Z", "2026-11-03T10:00:00Z"));
        // édition faite hors ligne AVANT la suppression : perd
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(id, "édité", "2026-11-02T10:00:00Z", null)))
                .andExpect(jsonPath("$.deletedAt").value("2026-11-03T10:00:00Z"));
        // édition faite APRÈS la suppression : gagne, le lien revient
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(id, "édité", "2026-11-04T10:00:00Z", null)))
                .andExpect(jsonPath("$.deletedAt").doesNotExist());
    }

    @Test
    void delete_poseTombstone_idempotent_404SiInconnu() throws Exception {
        UUID id = UUID.randomUUID();
        seed(id, link(id, "a supprimer", "2026-11-01T10:00:00Z", null));
        mvc.perform(authed(delete("/api/links/" + id))).andExpect(status().isOk()).andExpect(jsonPath("$.deletedAt").exists());
        String first = mvc.perform(authed(get("/api/links/" + id))).andReturn().getResponse().getContentAsString();
        mvc.perform(authed(delete("/api/links/" + id))).andExpect(status().isOk());
        String second = mvc.perform(authed(get("/api/links/" + id))).andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first); // le second DELETE ne bouge pas deletedAt
        mvc.perform(authed(delete("/api/links/" + UUID.randomUUID()))).andExpect(status().isNotFound());
    }

    @Test
    void liste_masqueLesTombstones_sauSinceEtIncludeDeleted() throws Exception {
        UUID live = UUID.randomUUID(), dead = UUID.randomUUID();
        seed(live, link(live, "vivant", "2031-01-01T10:00:00Z", null));
        seed(dead, link(dead, "mort", "2031-01-02T10:00:00Z", "2031-01-02T10:00:00Z"));
        String plain = mvc.perform(authed(get("/api/links"))).andReturn().getResponse().getContentAsString();
        assertThat(plain).contains(live.toString()).doesNotContain(dead.toString());
        String withDeleted = mvc.perform(authed(get("/api/links?includeDeleted=true"))).andReturn().getResponse().getContentAsString();
        assertThat(withDeleted).contains(dead.toString());
        String since = mvc.perform(authed(get("/api/links?since=2031-01-01T12:00:00Z"))).andReturn().getResponse().getContentAsString();
        assertThat(since).contains(dead.toString()).doesNotContain(live.toString());
    }

    @Test
    void validation_400() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(UUID.randomUUID(), "autre id", "2026-11-01T10:00:00Z", null)))
                .andExpect(status().isBadRequest());
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(id, "x", "2026-11-01T10:00:00Z", null).replace("https://example.com/a", "")))
                .andExpect(status().isBadRequest());
        mvc.perform(authed(put("/api/links/pas-un-uuid")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    // ---- événements ----

    private static String event(UUID id, UUID linkId, String type) {
        return """
            {"id":"%s","linkId":"%s","type":"%s","payload":{"tag":"java"},"at":"2026-11-01T10:00:00Z"}""".formatted(id, linkId, type);
    }

    @Test
    void evenement_ajoutIdempotent_etJamaisModifie() throws Exception {
        UUID id = UUID.randomUUID(), linkId = UUID.randomUUID();
        mvc.perform(authed(post("/api/events")).contentType(MediaType.APPLICATION_JSON).content(event(id, linkId, "tagged")))
                .andExpect(status().isCreated());
        // rejeu avec un autre type : 200 et l'existant est renvoyé inchangé
        mvc.perform(authed(post("/api/events")).contentType(MediaType.APPLICATION_JSON).content(event(id, linkId, "revisited")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.type").value("tagged"));
        mvc.perform(authed(get("/api/events?linkId=" + linkId))).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(authed(put("/api/events/" + id)).contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().is4xxClientError());
        mvc.perform(authed(delete("/api/events/" + id))).andExpect(status().is4xxClientError());
    }

    @Test
    void evenement_typeInconnu_400() throws Exception {
        mvc.perform(authed(post("/api/events")).contentType(MediaType.APPLICATION_JSON)
                        .content(event(UUID.randomUUID(), UUID.randomUUID(), "pirate")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void base_refuseUpdateEtDeleteSurEvents() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(authed(post("/api/events")).contentType(MediaType.APPLICATION_JSON).content(event(id, UUID.randomUUID(), "created")));
        assertThatThrownBy(() -> jdbc.update("UPDATE events SET type='revisited' WHERE id=?", id)).hasMessageContaining("append-only");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM events WHERE id=?", id)).hasMessageContaining("append-only");
    }

    // ---- captures ----

    static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0};

    @Test
    void capture_depot_rejeu_lecture() throws Exception {
        UUID id = UUID.randomUUID();
        mvc.perform(authed(put("/api/screenshots/" + id)).content(PNG)).andExpect(status().isCreated());
        mvc.perform(authed(put("/api/screenshots/" + id)).content(PNG)).andExpect(status().isOk());
        mvc.perform(authed(get("/api/screenshots/" + id)))
                .andExpect(status().isOk())
                .andExpect(content().contentType("image/png"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void capture_refuseNonImage_tropGros_inconnu_etPathTraversal() throws Exception {
        mvc.perform(authed(put("/api/screenshots/" + UUID.randomUUID())).content("<svg onload=alert(1)>".getBytes()))
                .andExpect(status().isUnsupportedMediaType());
        mvc.perform(authed(put("/api/screenshots/" + UUID.randomUUID())).content(new byte[2000]))
                .andExpect(status().isPayloadTooLarge());
        mvc.perform(authed(get("/api/screenshots/" + UUID.randomUUID()))).andExpect(status().isNotFound());
        mvc.perform(authed(get("/api/screenshots/..%2F..%2Fapplication.properties"))).andExpect(status().is4xxClientError());
    }
}
