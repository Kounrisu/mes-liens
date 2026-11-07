package fr.kounrisu.mesliens.link;

import static org.assertj.core.api.Assertions.assertThat;
import jakarta.validation.Validation;
import java.util.List;
import org.junit.jupiter.api.Test;

class LibraryDataTest {
    private LibraryData data(String description, String creator, String date, List<String> playlists) {
        return new LibraryData(false,false,"video",List.of(),"later","","","","","","",description,creator,date,playlists);
    }
    @Test void oldClientsPreserveNewMetadataAndExplicitEmptyClearsIt() {
        var saved=data("Description","Author","2026-11-07",List.of("https://www.youtube.com/playlist?list=PL123"));
        var old=data(null,null,null,null).withMetadataFrom(saved);
        assertThat(old.description()).isEqualTo("Description");
        assertThat(old.creator()).isEqualTo("Author");
        assertThat(old.playlists()).hasSize(1);
        assertThat(data("","","",List.of()).withMetadataFrom(saved).description()).isEmpty();
        assertThat(data(null,null,null,null).withMetadataFrom(null).playlists()).isEmpty();
    }
    @Test void validatesRealDatesAndSafePlaylistUrls() {
        try(var factory=Validation.buildDefaultValidatorFactory()) {
            var validator=factory.getValidator();
            assertThat(validator.validate(data("","","2026-02-30",List.of()))).isNotEmpty();
            assertThat(validator.validate(data("","","",List.of("javascript:alert(1)")))).isNotEmpty();
            assertThat(validator.validate(data("","","2026-11-07",List.of("https://www.youtube.com/playlist?list=PL123")))).isEmpty();
        }
    }
}
