package fr.kounrisu.mesliens.sync;

import fr.kounrisu.mesliens.event.EventDto;
import fr.kounrisu.mesliens.event.EventEntity;
import fr.kounrisu.mesliens.event.EventRepository;
import fr.kounrisu.mesliens.link.LinkDto;
import fr.kounrisu.mesliens.link.LinkEntity;
import fr.kounrisu.mesliens.link.LinkRepository;
import fr.kounrisu.mesliens.link.LinkService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Lecture incrémentale pour la synchronisation : « tout ce qui a été écrit sur le serveur depuis le numéro N ».
 * Le numéro est attribué par le serveur à chaque écriture (voir V2__sync_cursor.sql) : il ne dépend pas de l'horloge des appareils.
 * Les suppressions (tombstones) sont incluses. L'écriture passe par PUT /api/links/{id} et POST /api/events (idempotents).
 */
@RestController
@RequestMapping("/api/sync")
public class SyncController {

    /**
     * @param cursor à renvoyer en {@code since} au prochain appel
     * @param head   dernier numéro existant côté serveur ; si {@code since > head}, la base a été réinitialisée → le client repart de 0
     */
    public record SyncResponse(long cursor, long head, List<LinkDto> links, List<EventDto> events) {}

    /** Taille maximale d'un lot : borne la durée de la transaction et la taille de la requête. */
    public static final int MAX_BATCH = 500;

    public record LinksBatch(@NotNull @Size(max = MAX_BATCH) List<@Valid @NotNull LinkDto> links) {}

    public record EventsBatch(@NotNull @Size(max = MAX_BATCH) List<@Valid @NotNull EventDto> events) {}

    public record LinksResult(List<LinkDto> links) {}

    public record EventsResult(int added) {}

    private final LinkRepository links;
    private final EventRepository events;
    private final LinkService linkService;

    public SyncController(LinkRepository links, EventRepository events, LinkService linkService) {
        this.links = links;
        this.events = events;
        this.linkService = linkService;
    }

    /**
     * Envoi par lots (import de milliers de favoris : 1 requête pour 500 liens au lieu de 500, sous la limite de débit).
     * Atomique ; même règle « le plus récent gagne » que PUT /api/links/{id}. Retourne les versions qui font foi, dans l'ordre.
     */
    @PostMapping("/links")
    public LinksResult pushLinks(@Valid @RequestBody LinksBatch batch) {
        for (LinkDto l : batch.links()) {
            if (l.id().equals(l.parentId())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "un lien ne peut pas être son propre parent");
        }
        return new LinksResult(linkService.upsertAll(batch.links()));
    }

    /** Ajout seul et idempotent : les événements déjà présents ne sont jamais modifiés. */
    @PostMapping("/events")
    @Transactional
    public EventsResult pushEvents(@Valid @RequestBody EventsBatch batch) {
        int added = 0;
        for (EventDto e : batch.events()) {
            if (!events.existsById(e.id())) {
                events.save(new EventEntity(e));
                added++;
            }
        }
        return new EventsResult(added);
    }

    // REPEATABLE_READ : les deux tables sont lues dans le même instantané, le curseur est cohérent.
    @GetMapping
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public SyncResponse pull(@RequestParam(defaultValue = "0") long since) {
        List<LinkEntity> l = links.findByServerSeqGreaterThanOrderByServerSeqAsc(since);
        List<EventEntity> e = events.findByServerSeqGreaterThanOrderByServerSeqAsc(since);
        long cursor = Stream.concat(l.stream().map(LinkEntity::getServerSeq), e.stream().map(EventEntity::getServerSeq))
                .mapToLong(Long::longValue).max().orElse(since);
        long head = Math.max(links.maxServerSeq(), events.maxServerSeq());
        return new SyncResponse(cursor, head,
                l.stream().map(LinkEntity::toDto).toList(),
                e.stream().map(EventEntity::toDto).toList());
    }
}
