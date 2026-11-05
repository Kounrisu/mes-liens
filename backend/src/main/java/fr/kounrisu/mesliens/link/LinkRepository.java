package fr.kounrisu.mesliens.link;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LinkRepository extends JpaRepository<LinkEntity, UUID> {

    List<LinkEntity> findByUpdatedAtGreaterThanOrderByUpdatedAtAsc(Instant since);

    List<LinkEntity> findByDeletedAtIsNullOrderByCreatedAtDesc();

    List<LinkEntity> findAllByOrderByCreatedAtDesc();
}
