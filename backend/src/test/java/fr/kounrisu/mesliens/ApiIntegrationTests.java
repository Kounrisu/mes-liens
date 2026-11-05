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
    void categorieEtSource_sontConserveesEtOptionnellesPourUnAncienClient() throws Exception {
        UUID id = UUID.randomUUID();
        String withCat = link(id, "formation", "2026-11-01T10:00:00Z", null)
                .replace("\"screenshotId\":null,", "\"screenshotId\":null,\"category\":\"formation\",\"source\":\"Udemy\",");
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON).content(withCat))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("formation"))
                .andExpect(jsonPath("$.source").value("Udemy"));
        mvc.perform(authed(get("/api/links/" + id))).andExpect(jsonPath("$.category").value("formation"));
        // ancien client sans les champs : chaîne vide, pas d'erreur
        UUID old = UUID.randomUUID();
        mvc.perform(authed(put("/api/links/" + old)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(old, "ancien client", "2026-11-01T10:00:00Z", null)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.category").value(""));
        // catégorie trop longue : refusée
        UUID big = UUID.randomUUID();
        mvc.perform(authed(put("/api/links/" + big)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(big, "x", "2026-11-01T10:00:00Z", null)
                                .replace("\"screenshotId\":null,", "\"screenshotId\":null,\"category\":\"" + "a".repeat(201) + "\",")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rangDeFocus_conserve_nullParDefaut_etBornes() throws Exception {
        UUID id = UUID.randomUUID();
        String json = link(id, "focus", "2026-11-01T10:00:00Z", null).replace("\"screenshotId\":null,", "\"screenshotId\":null,\"focusRank\":2,");
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.focusRank").value(2));
        // retiré du focus : null
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON).content(link(id, "focus", "2026-11-02T10:00:00Z", null)))
                .andExpect(jsonPath("$.focusRank").doesNotExist());
        for (String bad : new String[] {"0", "-3", "100001"}) {
            UUID b = UUID.randomUUID();
            mvc.perform(authed(put("/api/links/" + b)).contentType(MediaType.APPLICATION_JSON)
                            .content(link(b, "x", "2026-11-01T10:00:00Z", null).replace("\"screenshotId\":null,", "\"screenshotId\":null,\"focusRank\":" + bad + ",")))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void siteEtLienRattache_conserves_ancienClientEstUnLienSimple_valeursInvalidesRefusees() throws Exception {
        UUID site = UUID.randomUUID(), child = UUID.randomUUID();
        mvc.perform(authed(put("/api/links/" + site)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(site, "Ultimate Courses", "2026-11-01T10:00:00Z", null).replace("\"screenshotId\":null,", "\"screenshotId\":null,\"kind\":\"site\",")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.kind").value("site"));
        mvc.perform(authed(put("/api/links/" + child)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(child, "Angular", "2026-11-01T10:00:00Z", null).replace("\"screenshotId\":null,", "\"screenshotId\":null,\"kind\":\"link\",\"parentId\":\"" + site + "\",")))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.parentId").value(site.toString()));
        // ancien client : ni kind ni parentId
        UUID old = UUID.randomUUID();
        mvc.perform(authed(put("/api/links/" + old)).contentType(MediaType.APPLICATION_JSON).content(link(old, "ancien", "2026-11-01T10:00:00Z", null)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.kind").value("link")).andExpect(jsonPath("$.parentId").doesNotExist());
        // kind inconnu, et lien parent de lui-même : refusés
        UUID bad = UUID.randomUUID();
        mvc.perform(authed(put("/api/links/" + bad)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(bad, "x", "2026-11-01T10:00:00Z", null).replace("\"screenshotId\":null,", "\"screenshotId\":null,\"kind\":\"dossier\",")))
                .andExpect(status().isBadRequest());
        mvc.perform(authed(put("/api/links/" + bad)).contentType(MediaType.APPLICATION_JSON)
                        .content(link(bad, "x", "2026-11-01T10:00:00Z", null).replace("\"screenshotId\":null,", "\"screenshotId\":null,\"parentId\":\"" + bad + "\",")))
                .andExpect(status().isBadRequest());
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

    @Test
    void learningData_roundTripAndOldClientPreservation() throws Exception {
        UUID id=UUID.randomUUID();
        String library="""
          ,"library":{"reviewed":true,"archived":false,"resourceType":"course","collections":["Angular"],"learningStatus":"active","objective":"Learn","resumeAt":"12:30","nextAction":"Practice","learned":"Signals","applyTo":"Project","reviewOn":"2026-12-01"}
          """;
        String initial=link(id,"Learning","2026-11-01T10:00:00Z",null);
        initial=initial.substring(0,initial.length()-1)+library+"}";
        mvc.perform(authed(put("/api/links/"+id)).contentType(MediaType.APPLICATION_JSON).content(initial))
          .andExpect(status().isCreated()).andExpect(jsonPath("$.library.learned").value("Signals"));
        mvc.perform(authed(put("/api/links/"+id)).contentType(MediaType.APPLICATION_JSON).content(link(id,"Old client","2026-11-02T10:00:00Z",null)))
          .andExpect(status().isOk()).andExpect(jsonPath("$.library.learned").value("Signals"));
        mvc.perform(authed(put("/api/links/"+UUID.randomUUID())).contentType(MediaType.APPLICATION_JSON).content(initial.replace("active","invalid")))
          .andExpect(status().isBadRequest());
    }

    @Test
    void insights_areLeasedAndDoNotOverwritePersonalData() throws Exception {
        UUID id=UUID.randomUUID();
        seed(id,link(id,"Personal title","2026-11-01T10:00:00Z",null));
        mvc.perform(authed(post("/api/insights/recheck")).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[\""+id+"\"]}"))
          .andExpect(status().isOk());
        jdbc.update("UPDATE link_insights SET next_check_at='2000-01-01' WHERE link_id=?",id);
        mvc.perform(authed(post("/api/insights/claim"))).andExpect(status().isOk()).andExpect(jsonPath("$[0].linkId").value(id.toString()));
        UUID claim=jdbc.queryForObject("SELECT claim_id FROM link_insights WHERE link_id=?",UUID.class,id);
        String result="""
          {"claimId":"%s","url":"https://example.com/a","status":"working","httpStatus":200,"title":"Fetched title","description":"Summary","finalUrl":"https://example.com/a"}
          """.formatted(claim);
        long seq=jdbc.queryForObject("SELECT server_seq FROM links WHERE id=?",Long.class,id);
        mvc.perform(authed(put("/api/insights/"+id)).contentType(MediaType.APPLICATION_JSON).content(result)).andExpect(status().isOk());
        mvc.perform(authed(put("/api/insights/"+id)).contentType(MediaType.APPLICATION_JSON).content(result)).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT server_seq FROM links WHERE id=?",Long.class,id)).isEqualTo(seq);
        mvc.perform(authed(get("/api/links/"+id))).andExpect(jsonPath("$.title").value("Personal title"));
        mvc.perform(authed(get("/api/insights"))).andExpect(status().isOk());
    }

    @Test
    void insights_rejectResultAfterUrlChanges() throws Exception {
        UUID id=UUID.randomUUID();seed(id,link(id,"x","2026-11-01T10:00:00Z",null));
        mvc.perform(authed(post("/api/insights/recheck")).contentType(MediaType.APPLICATION_JSON).content("{\"ids\":[\""+id+"\"]}"));
        jdbc.update("UPDATE link_insights SET next_check_at='1990-01-01' WHERE link_id=?",id);
        mvc.perform(authed(post("/api/insights/claim"))).andExpect(status().isOk());
        UUID claim=jdbc.queryForObject("SELECT claim_id FROM link_insights WHERE link_id=?",UUID.class,id);
        seed(id,link(id,"x","2026-11-02T10:00:00Z",null).replace("https://example.com/a","https://example.org/new"));
        String result="""
          {"claimId":"%s","url":"https://example.com/a","status":"working","httpStatus":200,"title":"Old","description":"","finalUrl":"https://example.com/a"}
          """.formatted(claim);
        mvc.perform(authed(put("/api/insights/"+id)).contentType(MediaType.APPLICATION_JSON).content(result)).andExpect(status().isConflict());
    }
}
