package fr.kounrisu.mesliens.event;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Immutable
@Table(name = "events")
public class EventEntity {

    @Id
    private UUID id;

    @Column(name = "link_id", nullable = false)
    private UUID linkId;

    @Column(nullable = false)
    private String type;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload;

    @Column(nullable = false)
    private Instant at;

    @Column(name = "server_seq", insertable = false, updatable = false)
    private Long serverSeq;

    protected EventEntity() {}

    public EventEntity(EventDto d) {
        this.id = d.id();
        this.linkId = d.linkId();
        this.type = d.type();
        this.payload = d.payload();
        this.at = d.at();
    }

    public Long getServerSeq() { return serverSeq; }

    public EventDto toDto() {
        return new EventDto(id, linkId, type, payload, at);
    }
}
