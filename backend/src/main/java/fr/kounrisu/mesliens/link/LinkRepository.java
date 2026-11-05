package fr.kounrisu.mesliens.link;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface LinkRepository extends JpaRepository<LinkEntity, UUID> {

    List<LinkEntity> findByUpdatedAtGreaterThanOrderByUpdatedAtAsc(Instant since);

    List<LinkEntity> findByDeletedAtIsNullOrderByCreatedAtDesc();

    List<LinkEntity> findAllByOrderByCreatedAtDesc();

    List<LinkEntity> findByServerSeqGreaterThanOrderByServerSeqAsc(long seq);

    @Query("select coalesce(max(l.serverSeq), 0) from LinkEntity l")
    long maxServerSeq();
}
