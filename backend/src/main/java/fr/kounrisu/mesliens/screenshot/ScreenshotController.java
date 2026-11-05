package fr.kounrisu.mesliens.screenshot;

import fr.kounrisu.mesliens.config.AppProperties;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * Captures sur disque, jamais en base. Le nom du fichier est l'UUID validé par Spring (pas de chemin fourni par le client),
 * le type est déterminé par les octets du fichier (pas par l'en-tête Content-Type envoyé par le client).
 */
@RestController
@RequestMapping("/api/screenshots")
public class ScreenshotController {

    private final Path dir;
    private final long maxBytes;

    public ScreenshotController(AppProperties props) throws IOException {
        this.dir = Path.of(props.screenshots().dir()).toAbsolutePath().normalize();
        this.maxBytes = props.screenshots().maxBytes();
        Files.createDirectories(dir);
    }

    /** Idempotent : une capture est immuable. Si l'id existe déjà, rien n'est réécrit (200). */
    @PutMapping("/{id}")
    public ResponseEntity<Void> put(@PathVariable UUID id, HttpServletRequest req) throws IOException {
        if (req.getContentLengthLong() > maxBytes) throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE);
        Path target = dir.resolve(id.toString());
        if (Files.exists(target)) return ResponseEntity.ok().build();

        byte[] data;
        try (InputStream in = req.getInputStream()) {
            data = in.readNBytes((int) maxBytes + 1);
        }
        if (data.length > maxBytes) throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE);
        if (ImageType.detect(data) == null) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "PNG, JPEG, WebP ou GIF attendu");

        Path tmp = Files.createTempFile(dir, ".upload-", ".tmp");
        try {
            Files.write(tmp, data);
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE);
        } finally {
            Files.deleteIfExists(tmp);
        }
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @GetMapping("/{id}")
    public ResponseEntity<byte[]> get(@PathVariable UUID id) throws IOException {
        Path file = dir.resolve(id.toString());
        if (!Files.isRegularFile(file)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        byte[] data = Files.readAllBytes(file);
        MediaType type = MediaType.parseMediaType(ImageType.detect(data) != null ? ImageType.detect(data) : "application/octet-stream");
        return ResponseEntity.ok()
                .contentType(type)
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'")
                .cacheControl(CacheControl.maxAge(java.time.Duration.ofDays(365)).cachePrivate().immutable())
                .body(data);
    }
}
