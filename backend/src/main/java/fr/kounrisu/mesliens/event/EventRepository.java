package fr.kounrisu.mesliens.event;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface EventRepository extends JpaRepository<EventEntity, UUID> {

    List<EventEntity> findByLinkIdOrderByAtAsc(UUID linkId);

    List<EventEntity> findByAtGreaterThanOrderByAtAsc(Instant since);

    List<EventEntity> findAllByOrderByAtAsc();

    List<EventEntity> findByServerSeqGreaterThanOrderByServerSeqAsc(long seq);

    @Query("select coalesce(max(e.serverSeq), 0) from EventEntity e")
    long maxServerSeq();
}
