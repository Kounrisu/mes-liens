package fr.kounrisu.mesliens.event;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Journal en ajout seul : pas de PUT, pas de DELETE. Le POST est idempotent (rejeu après coupure réseau). */
@RestController
@RequestMapping("/api/events")
public class EventController {

    private final EventRepository repo;

    public EventController(EventRepository repo) {
        this.repo = repo;
    }

    @GetMapping
    public List<EventDto> list(@RequestParam(required = false) UUID linkId, @RequestParam(required = false) Instant since) {
        var rows = linkId != null ? repo.findByLinkIdOrderByAtAsc(linkId)
                : since != null ? repo.findByAtGreaterThanOrderByAtAsc(since)
                : repo.findAllByOrderByAtAsc();
        return rows.stream().map(EventEntity::toDto).toList();
    }

    /** 201 si ajouté ; 200 si l'id existait déjà (l'existant n'est jamais modifié). */
    @PostMapping
    public ResponseEntity<EventDto> add(@Valid @RequestBody EventDto body) {
        var existing = repo.findById(body.id());
        if (existing.isPresent()) return ResponseEntity.ok(existing.get().toDto());
        repo.save(new EventEntity(body));
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }
}
