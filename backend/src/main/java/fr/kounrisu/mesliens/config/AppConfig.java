package fr.kounrisu.mesliens.config;

import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
@EnableConfigurationProperties(AppProperties.class)
public class AppConfig {

    /**
     * CORS uniquement si des origines sont listées (PWA et API sur des domaines différents, ou dev local).
     * Le filtre passe AVANT TokenFilter : la requête « preflight » OPTIONS ne porte pas le jeton et doit être répondue sans lui.
     * Jamais de « * » : le jeton donne accès à toutes les données.
     */
    @Bean
    FilterRegistrationBean<CorsFilter> corsFilter(AppProperties props) {
        var cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(props.corsAllowedOrigins());
        cfg.setAllowedMethods(List.of("GET", "PUT", "POST", "DELETE"));
        cfg.setAllowedHeaders(List.of("X-Api-Token", "Content-Type"));
        cfg.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", cfg);
        var reg = new FilterRegistrationBean<>(new CorsFilter(source));
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE);
        reg.setEnabled(!props.corsAllowedOrigins().isEmpty());
        return reg;
    }
}
