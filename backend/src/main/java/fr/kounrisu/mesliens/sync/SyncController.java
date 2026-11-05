package fr.kounrisu.mesliens.sync;

import fr.kounrisu.mesliens.event.EventDto;
import fr.kounrisu.mesliens.event.EventEntity;
import fr.kounrisu.mesliens.event.EventRepository;
import fr.kounrisu.mesliens.link.LinkDto;
import fr.kounrisu.mesliens.link.LinkEntity;
import fr.kounrisu.mesliens.link.LinkRepository;
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

    private final LinkRepository links;
    private final EventRepository events;

    public SyncController(LinkRepository links, EventRepository events) {
        this.links = links;
        this.events = events;
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
