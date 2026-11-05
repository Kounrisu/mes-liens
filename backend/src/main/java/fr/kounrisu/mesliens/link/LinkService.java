package fr.kounrisu.mesliens.link;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LinkService {

    public record UpsertResult(LinkDto link, boolean created, boolean applied) {}

    private final LinkRepository repo;
    private final Clock clock;

    public LinkService(LinkRepository repo) {
        this.repo = repo;
        this.clock = Clock.systemUTC();
    }

    /**
     * Le plus récent gagne, sur l'enregistrement entier. À updatedAt égal, la version du serveur est conservée
     * (un rejeu de la même requête est donc idempotent). Le client reçoit toujours la version qui fait foi.
     */
    @Transactional
    public UpsertResult upsert(LinkDto in) {
        Optional<LinkEntity> existing = repo.findById(in.id());
        if (existing.isEmpty()) {
            return new UpsertResult(repo.save(LinkEntity.from(in)).toDto(), true, true);
        }
        LinkEntity e = existing.get();
        if (in.updatedAt().isAfter(e.getUpdatedAt())) {
            e.apply(in);
            return new UpsertResult(e.toDto(), false, true);
        }
        return new UpsertResult(e.toDto(), false, false);
    }

    /**
     * Même règle que {@link #upsert}, pour un lot, en UNE transaction (tout ou rien : si un élément est refusé, rien n'est écrit
     * et le client réessaie élément par élément pour isoler le fautif). Retourne, dans le même ordre, la version qui fait foi.
     */
    @Transactional
    public List<LinkDto> upsertAll(List<LinkDto> batch) {
        return batch.stream().map(in -> upsert(in).link()).toList();
    }

    @Transactional(readOnly = true)
    public Optional<LinkDto> find(UUID id) {
        return repo.findById(id).map(LinkEntity::toDto);
    }

    @Transactional(readOnly = true)
    public List<LinkDto> list(Instant since, boolean includeDeleted) {
        List<LinkEntity> rows = since != null
                ? repo.findByUpdatedAtGreaterThanOrderByUpdatedAtAsc(since) // tombstones inclus : indispensables à la synchro
                : includeDeleted ? repo.findAllByOrderByCreatedAtDesc() : repo.findByDeletedAtIsNullOrderByCreatedAtDesc();
        return rows.stream().map(LinkEntity::toDto).toList();
    }

    /** Suppression logique. Retourne empty si le lien n'existe pas ; idempotent s'il est déjà supprimé. */
    @Transactional
    public Optional<LinkDto> softDelete(UUID id) {
        return repo.findById(id).map(e -> {
            if (e.getDeletedAt() == null) e.softDelete(Instant.now(clock));
            return e.toDto();
        });
    }
}
