package fr.kounrisu.mesliens.link;

import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/links")
public class LinkController {

    private final LinkService service;

    public LinkController(LinkService service) {
        this.service = service;
    }

    @GetMapping
    public List<LinkDto> list(@RequestParam(required = false) Instant since,
                              @RequestParam(defaultValue = "false") boolean includeDeleted) {
        return service.list(since, includeDeleted);
    }

    @GetMapping("/{id}")
    public LinkDto get(@PathVariable UUID id) {
        return service.find(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    /** Création ou remplacement (id UUID généré côté client). 201 si créé, 200 sinon ; le corps est la version qui fait foi. */
    @PutMapping("/{id}")
    public ResponseEntity<LinkDto> put(@PathVariable UUID id, @Valid @RequestBody LinkDto body) {
        if (!id.equals(body.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "id du chemin ≠ id du corps");
        var result = service.upsert(body);
        return ResponseEntity.status(result.created() ? HttpStatus.CREATED : HttpStatus.OK).body(result.link());
    }

    @DeleteMapping("/{id}")
    public LinkDto delete(@PathVariable UUID id) {
        return service.softDelete(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }
}
