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
    @NotNull @Pattern(regexp="|\\d{4}-\\d{2}-\\d{2}") String reviewOn
) {
    public static LibraryData empty() { return new LibraryData(false,false,"other",List.of(),"later","","","","","",""); }
}
