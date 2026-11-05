package fr.kounrisu.mesliens.link;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "links")
public class LinkEntity {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String url;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String domain;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(nullable = false, columnDefinition = "text[]")
    private String[] tags;

    @Column(nullable = false)
    private String note;

    @Column(name = "screenshot_id")
    private UUID screenshotId;

    @Column(nullable = false)
    private String category;

    @Column(nullable = false)
    private String source;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private LibraryData library = LibraryData.empty();

    @Column(nullable = false)
    private String kind;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(name = "focus_rank")
    private Integer focusRank;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    /** Attribué par trigger à chaque écriture ; sert de curseur de synchronisation. */
    @Column(name = "server_seq", insertable = false, updatable = false)
    private Long serverSeq;

    protected LinkEntity() {}

    public static LinkEntity from(LinkDto d) {
        LinkEntity e = new LinkEntity();
        e.id = d.id();
        e.apply(d);
        return e;
    }

    /** Remplace l'enregistrement entier (le plus récent gagne au niveau du lien, pas du champ). */
    public void apply(LinkDto d) {
        this.url = d.url();
        this.title = d.title();
        this.domain = d.domain();
        this.tags = d.tags().toArray(String[]::new);
        this.note = d.note();
        this.screenshotId = d.screenshotId();
        this.category = d.category();
        this.source = d.source();
        // Older installed PWAs omit this field: preserve new learning data.
        if (d.library() != null) this.library = d.library();
        this.focusRank = d.focusRank();
        this.kind = d.kind();
        this.parentId = d.parentId();
        this.createdAt = d.createdAt();
        this.updatedAt = d.updatedAt();
        this.deletedAt = d.deletedAt();
    }

    public void softDelete(Instant now) {
        this.deletedAt = now;
        this.updatedAt = now;
    }

    public LinkDto toDto() {
        return new LinkDto(id, url, title, domain, java.util.List.of(tags), note, screenshotId, category, source, focusRank, kind, parentId, createdAt, updatedAt, deletedAt, library);
    }

    public Long getServerSeq() { return serverSeq; }
    public UUID getId() { return id; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeletedAt() { return deletedAt; }
}
