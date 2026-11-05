package fr.kounrisu.mesliens.link;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/insights")
public class InsightsController {
    private final JdbcTemplate jdbc;
    public InsightsController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Insight(UUID linkId, String url, String status, Integer httpStatus, String title, String description, String finalUrl, UUID screenshotId, Instant checkedAt, Instant capturedAt) {}
    public record Job(UUID linkId, String url, UUID claimId, UUID screenshotId) {}
    public record Result(@NotNull UUID claimId, @NotBlank @Size(max=4096) String url,
        @NotNull @Pattern(regexp="working|redirected|login|blocked|unavailable|missing|unsafe") String status,
        @Min(100) @Max(599) Integer httpStatus, @NotNull @Size(max=1000) String title,
        @NotNull @Size(max=5000) String description, @NotNull @Size(max=4096) String finalUrl, UUID screenshotId) {}
    public record Recheck(@NotNull @Size(min=1,max=200) List<@NotNull UUID> ids) {}

    private Insight map(ResultSet r, int row) throws SQLException {
        return new Insight(r.getObject("link_id",UUID.class),r.getString("url"),r.getString("status"),(Integer)r.getObject("http_status"),r.getString("title"),r.getString("description"),r.getString("final_url"),r.getObject("screenshot_id",UUID.class),r.getTimestamp("checked_at") == null ? null : r.getTimestamp("checked_at").toInstant(),r.getTimestamp("captured_at") == null ? null : r.getTimestamp("captured_at").toInstant());
    }
    @GetMapping
    public List<Insight> list() { return jdbc.query("SELECT i.* FROM link_insights i JOIN links l ON l.id=i.link_id WHERE l.deleted_at IS NULL AND l.url=i.url ORDER BY i.link_id",this::map); }

    /** Seed the queue lazily; do not touch links or their synchronization cursor. */
    private void seed() {
        jdbc.update("""
            INSERT INTO link_insights(link_id,url)
            SELECT id,url FROM links WHERE deleted_at IS NULL AND COALESCE((library->>'archived')::boolean,false)=false
            ON CONFLICT(link_id) DO UPDATE SET url=excluded.url,status='pending',http_status=null,title='',description='',final_url='',
              screenshot_id=null,captured_at=null,checked_at=null,next_check_at=now(),lease_until=null,claim_id=null,failures=0
            WHERE link_insights.url <> excluded.url
            """);
    }
    @PostMapping("/recheck") @Transactional
    public void recheck(@Valid @RequestBody Recheck request) {
        seed();
        for (UUID id : request.ids()) jdbc.update("UPDATE link_insights SET next_check_at=now() WHERE link_id=? AND (lease_until IS NULL OR lease_until < now())",id);
    }
    @PostMapping("/claim") @Transactional
    public List<Job> claim() {
        seed();
        return jdbc.query("""
          UPDATE link_insights SET claim_id=?, lease_until=now()+interval '3 minutes'
          WHERE link_id=(SELECT i.link_id FROM link_insights i JOIN links l ON l.id=i.link_id
            WHERE l.deleted_at IS NULL AND COALESCE((l.library->>'archived')::boolean,false)=false
            AND i.next_check_at<=now() AND (i.lease_until IS NULL OR i.lease_until<now())
            ORDER BY i.next_check_at,l.created_at DESC LIMIT 1 FOR UPDATE OF i SKIP LOCKED)
          RETURNING link_id,url,claim_id,screenshot_id
          """, (r,n)->new Job(r.getObject(1,UUID.class),r.getString(2),r.getObject(3,UUID.class),r.getObject(4,UUID.class)),UUID.randomUUID());
    }
    @PutMapping("/{id}") @Transactional
    public void complete(@PathVariable UUID id, @Valid @RequestBody Result result) {
        boolean failed = List.of("unavailable","missing").contains(result.status());
        int updated = jdbc.update("""
          UPDATE link_insights i SET status=?,http_status=?,title=?,description=?,final_url=?,
            screenshot_id=COALESCE(i.screenshot_id,?),captured_at=CASE WHEN i.screenshot_id IS NULL AND ?::uuid IS NOT NULL THEN now() ELSE i.captured_at END,
            checked_at=now(),lease_until=null,claim_id=null,failures=CASE WHEN ? THEN failures+1 ELSE 0 END,
            next_check_at=now() + CASE WHEN ? THEN interval '2 days' ELSE interval '30 days' END
          WHERE i.link_id=? AND i.claim_id=? AND i.url=? AND EXISTS(SELECT 1 FROM links l WHERE l.id=i.link_id AND l.url=i.url AND l.deleted_at IS NULL)
          """, result.status(),result.httpStatus(),result.title(),result.description(),result.finalUrl(),result.screenshotId(),result.screenshotId(),failed,failed,id,result.claimId(),result.url());
        if (updated == 0) throw new ResponseStatusException(HttpStatus.CONFLICT,"Contrôle périmé : URL ou tâche modifiée");
    }
}
