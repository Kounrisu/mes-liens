package fr.kounrisu.mesliens;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties = {
        "mesliens.token=test-token-test-token-test-token-0000",
        "mesliens.screenshots.dir=target/test-screenshots-sync",
        "mesliens.rate-limit.per-minute=100000",
        "mesliens.rate-limit.failed-auth-per-minute=100000",
        "mesliens.cors-allowed-origins=http://localhost:4300"})
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class SyncIntegrationTests {

    static final String TOKEN = "test-token-test-token-test-token-0000";
    static final Pattern CURSOR = Pattern.compile("\"cursor\":(\\d+)");
    static final Pattern HEAD = Pattern.compile("\"head\":(\\d+)");

    @Autowired MockMvc mvc;

    private MockHttpServletRequestBuilder authed(MockHttpServletRequestBuilder b) {
        return b.secure(true).header("X-Api-Token", TOKEN);
    }

    private static String link(UUID id, String title, String updatedAt, String deletedAt) {
        return """
            {"id":"%s","url":"https://example.com/a","title":"%s","domain":"example.com","tags":[],
             "note":"","screenshotId":null,"createdAt":"2020-01-01T00:00:00Z","updatedAt":"%s","deletedAt":%s}"""
                .formatted(id, title, updatedAt, deletedAt == null ? "null" : "\"" + deletedAt + "\"");
    }

    private void putLink(UUID id, String json) throws Exception {
        mvc.perform(authed(put("/api/links/" + id)).contentType(MediaType.APPLICATION_JSON).content(json)).andExpect(status().is2xxSuccessful());
    }

    private String pull(long since) throws Exception {
        return mvc.perform(authed(get("/api/sync?since=" + since))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static long num(Pattern p, String json) {
        var m = p.matcher(json);
        assertThat(m.find()).isTrue();
        return Long.parseLong(m.group(1));
    }

    @Test
    void lienCreeHorsLigneAvecVieilleDate_estQuandMemeVisiblePourUnAppareilDejaSynchronise() throws Exception {
        // Le portable synchronise : il voit le lien A.
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        putLink(a, link(a, "A", "2026-11-05T11:00:00Z", null));
        String first = pull(0);
        long cursor = num(CURSOR, first);
        assertThat(first).contains(a.toString());

        // Le téléphone, hors ligne depuis 10h00, pousse B (updatedAt 10:00 < A 11:00) APRÈS la synchro du portable.
        putLink(b, link(b, "B", "2026-11-05T10:00:00Z", null));
        String second = pull(cursor);
        assertThat(second).contains(b.toString()).doesNotContain(a.toString());
        // Un curseur basé sur updatedAt aurait renvoyé vide ici.
    }

    @Test
    void tombstoneEtModification_avancentLeCurseur_maisUnRejeuSansEffetNonOu() throws Exception {
        UUID id = UUID.randomUUID();
        putLink(id, link(id, "v1", "2026-11-05T10:00:00Z", null));
        long c1 = num(CURSOR, pull(0));

        // rejeu d'une version plus ancienne : refusée, aucune écriture → rien de nouveau
        putLink(id, link(id, "ancien", "2026-11-05T09:00:00Z", null));
        String none = pull(c1);
        assertThat(none).doesNotContain(id.toString());
        assertThat(num(CURSOR, none)).isEqualTo(c1);

        // suppression : tombstone visible dans la lecture incrémentale
        putLink(id, link(id, "v1", "2026-11-05T12:00:00Z", "2026-11-05T12:00:00Z"));
        String del = pull(c1);
        assertThat(del).contains(id.toString()).contains("\"deletedAt\":\"2026-11-05T12:00:00Z\"");
        assertThat(num(CURSOR, del)).isGreaterThan(c1);
    }

    @Test
    void evenements_sontSynchronisesAvecLeCurseur_etHeadPermetDeDetecterUneBaseReinitialisee() throws Exception {
        long before = num(CURSOR, pull(0));
        UUID ev = UUID.randomUUID();
        mvc.perform(authed(post("/api/events")).contentType(MediaType.APPLICATION_JSON).content("""
                {"id":"%s","linkId":"%s","type":"created","payload":{},"at":"2001-01-01T00:00:00Z"}""".formatted(ev, UUID.randomUUID())))
                .andExpect(status().isCreated());
        String r = pull(before);
        assertThat(r).contains(ev.toString()); // `at` très ancien, mais le curseur le trouve
        long head = num(HEAD, r);
        assertThat(head).isEqualTo(num(CURSOR, r));
        // client avec un curseur « du futur » (serveur réinitialisé) : head < since → à lui de repartir de 0
        String future = pull(head + 1000);
        assertThat(num(HEAD, future)).isLessThan(head + 1000);
    }

    @Test
    void sansJeton_401() throws Exception {
        mvc.perform(get("/api/sync").secure(true)).andExpect(status().isUnauthorized());
    }

    // ---- envoi par lots ----

    @Test
    void lot_deLiens_appliqueLaRegleDuPlusRecent_etRetourneLaVersionQuiFaitFoi() throws Exception {
        UUID a = UUID.randomUUID(), b = UUID.randomUUID();
        putLink(a, link(a, "A serveur récent", "2026-11-05T12:00:00Z", null));
        String body = "{\"links\":[" + link(a, "A ancien", "2026-11-05T10:00:00Z", null) + "," + link(b, "B nouveau", "2026-11-05T10:00:00Z", null) + "]}";
        mvc.perform(authed(post("/api/sync/links")).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.links.length()").value(2))
                .andExpect(jsonPath("$.links[0].title").value("A serveur récent")) // le serveur garde la plus récente
                .andExpect(jsonPath("$.links[1].title").value("B nouveau"));
        String pulled = pull(0);
        assertThat(pulled).contains(b.toString());
    }

    @Test
    void lot_estAtomique_unElementInvalideRefuseTout() throws Exception {
        UUID good = UUID.randomUUID(), bad = UUID.randomUUID();
        String body = "{\"links\":[" + link(good, "bon", "2026-11-05T10:00:00Z", null) + ","
                + link(bad, "mauvais", "2026-11-05T10:00:00Z", null).replace("\"url\":\"https://example.com/a\"", "\"url\":\"\"") + "]}";
        mvc.perform(authed(post("/api/sync/links")).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        assertThat(pull(0)).doesNotContain(good.toString()); // rien d'écrit
    }

    @Test
    void lot_tropGrosRefuse_etEvenementsIdempotents() throws Exception {
        StringBuilder big = new StringBuilder("{\"links\":[");
        for (int i = 0; i < 501; i++) big.append(i == 0 ? "" : ",").append(link(UUID.randomUUID(), "x", "2026-11-05T10:00:00Z", null));
        big.append("]}");
        mvc.perform(authed(post("/api/sync/links")).contentType(MediaType.APPLICATION_JSON).content(big.toString())).andExpect(status().isBadRequest());

        UUID ev = UUID.randomUUID();
        String events = "{\"events\":[{\"id\":\"%s\",\"linkId\":\"%s\",\"type\":\"created\",\"payload\":{},\"at\":\"2026-11-05T10:00:00Z\"}]}".formatted(ev, UUID.randomUUID());
        mvc.perform(authed(post("/api/sync/events")).contentType(MediaType.APPLICATION_JSON).content(events))
                .andExpect(status().isOk()).andExpect(jsonPath("$.added").value(1));
        mvc.perform(authed(post("/api/sync/events")).contentType(MediaType.APPLICATION_JSON).content(events))
                .andExpect(status().isOk()).andExpect(jsonPath("$.added").value(0)); // rejeu : rien d'ajouté
    }
    // ---- CORS ----

    @Test
    void cors_preflightOrigineAutorisee_repondSansJeton() throws Exception {
        mvc.perform(options("/api/sync").secure(true)
                        .header("Origin", "http://localhost:4300")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "x-api-token"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:4300"));
    }

    @Test
    void cors_origineNonListee_refusee() throws Exception {
        mvc.perform(options("/api/sync").secure(true)
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
        mvc.perform(authed(get("/api/sync")).header("Origin", "https://evil.example")).andExpect(status().isForbidden());
    }
}
