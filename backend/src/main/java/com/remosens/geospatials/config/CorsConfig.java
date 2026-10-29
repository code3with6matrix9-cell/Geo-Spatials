package com.remosens.geospatials.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

/**
 * Global CORS for the registration API.
 *
 * <p>Origins come from {@code app.cors.allowed-origins} (env var {@code CORS_ALLOWED_ORIGINS}).
 * Entries are trimmed and blanks are dropped so a stray space or trailing comma in the
 * environment variable cannot silently invalidate the whole allow-list. The effective
 * list is logged at startup so Render logs show exactly which origins are permitted.
 */
@Slf4j
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;

    public CorsConfig(@Value("${app.cors.allowed-origins}") String[] allowedOrigins) {
        this.allowedOrigins = Arrays.stream(allowedOrigins)
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toArray(String[]::new);
        log.info("CORS enabled for /api/** with allowed origins: {}", Arrays.toString(this.allowedOrigins));
    }

    /** Effective allow-list after trimming; package-private for tests. */
    String[] allowedOrigins() {
        return allowedOrigins.clone();
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }
}
