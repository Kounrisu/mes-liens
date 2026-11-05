package fr.kounrisu.mesliens.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "mesliens")
public record AppProperties(
        String token,
        boolean requireHttps,
        boolean trustForwardedFor,
        RateLimit rateLimit,
        Screenshots screenshots) {

    public record RateLimit(int perMinute, int failedAuthPerMinute) {}

    public record Screenshots(String dir, long maxBytes) {}

    /** Le démarrage échoue si le jeton est absent ou trop faible : pas de repli silencieux vers « sans auth ». */
    public AppProperties {
        if (token == null || token.length() < 32) {
            throw new IllegalStateException(
                    "MESLIENS_TOKEN manquant ou trop court (minimum 32 caractères). Générer : openssl rand -hex 32");
        }
    }
}
