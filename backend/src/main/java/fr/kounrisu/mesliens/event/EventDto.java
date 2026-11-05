package fr.kounrisu.mesliens.event;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record EventDto(
        @NotNull UUID id,
        @NotNull UUID linkId,
        @NotNull @Pattern(regexp = "created|tagged|untagged|note_edited|screenshot_added|revisited") String type,
        @NotNull Map<String, Object> payload,
        @NotNull Instant at) {}
