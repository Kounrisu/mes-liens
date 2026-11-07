package fr.kounrisu.mesliens.link;

import jakarta.validation.constraints.*;
import java.util.List;

public record LibraryData(
    boolean reviewed, boolean archived,
    @NotNull @Pattern(regexp="other|course|article|video|tool|post") String resourceType,
    @NotNull @Size(max=30) List<@NotBlank @Size(max=100) String> collections,
    @NotNull @Pattern(regexp="later|active|done") String learningStatus,
    @NotNull @Size(max=10000) String objective,
    @NotNull @Size(max=10000) String resumeAt,
    @NotNull @Size(max=10000) String nextAction,
    @NotNull @Size(max=10000) String learned,
    @NotNull @Size(max=10000) String applyTo,
    @NotNull @Pattern(regexp="|\\d{4}-\\d{2}-\\d{2}") String reviewOn,
    @Size(max=10000) String description,
    @Size(max=300) String creator,
    @Pattern(regexp="|\\d{4}-\\d{2}-\\d{2}") String publishedAt,
    @Size(max=100) List<@NotNull @Pattern(regexp="https://www\\.youtube\\.com/playlist\\?list=[A-Za-z0-9_-]{2,150}") String> playlists
) {
    public static LibraryData empty() { return new LibraryData(false,false,"other",List.of(),"later","","","","","","","","","",List.of()); }

    /** An older installed client must not erase metadata it does not know about. Empty values explicitly clear it. */
    public LibraryData withMetadataFrom(LibraryData previous) {
        return new LibraryData(reviewed, archived, resourceType, collections, learningStatus, objective, resumeAt,
            nextAction, learned, applyTo, reviewOn,
            description != null ? description : previous != null && previous.description != null ? previous.description : "",
            creator != null ? creator : previous != null && previous.creator != null ? previous.creator : "",
            publishedAt != null ? publishedAt : previous != null && previous.publishedAt != null ? previous.publishedAt : "",
            playlists != null ? playlists : previous != null && previous.playlists != null ? previous.playlists : List.of());
    }

    @AssertTrue(message="Date de publication invalide")
    @com.fasterxml.jackson.annotation.JsonIgnore
    public boolean isPublicationDateValid() {
        if (publishedAt == null || publishedAt.isEmpty()) return true;
        try { return java.time.LocalDate.parse(publishedAt).toString().equals(publishedAt); }
        catch (java.time.DateTimeException e) { return false; }
    }
}
