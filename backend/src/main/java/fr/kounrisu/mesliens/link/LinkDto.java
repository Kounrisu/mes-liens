package fr.kounrisu.mesliens.link;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record LinkDto(
        @NotNull UUID id,
        @NotBlank @Size(max = 4096) String url,
        @NotNull @Size(max = 1000) String title,
        @NotNull @Size(max = 255) String domain,
        @NotNull @Size(max = 50) List<@NotBlank @Size(max = 64) String> tags,
        @NotNull @Size(max = 20000) String note,
        UUID screenshotId,
        @Size(max = 64) String category,
        @Size(max = 100) String source,
        @Min(1) @Max(100000) Integer focusRank,
        @NotNull Instant createdAt,
        @NotNull Instant updatedAt,
        Instant deletedAt) {

    /** Tolérant : un ancien client qui n'envoie pas category/source reçoit une chaîne vide (pas une erreur). */
    public LinkDto {
        category = category == null ? "" : category.strip();
        source = source == null ? "" : source.strip();
    }
}
