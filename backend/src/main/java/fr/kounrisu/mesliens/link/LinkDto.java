package fr.kounrisu.mesliens.link;

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
        @NotNull Instant createdAt,
        @NotNull Instant updatedAt,
        Instant deletedAt) {}
