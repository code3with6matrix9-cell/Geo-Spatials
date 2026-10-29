package com.remosens.geospatials.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

class CorsConfigTest {

    @Test
    void keepsProductionAndLocalOriginsFromDefaultProperty() {
        // Mirrors the default in application.yml.
        String[] configured = {
                "https://geo-spatials-frontend.vercel.app",
                "http://localhost:5173",
                "http://localhost:5174",
        };

        CorsConfig config = new CorsConfig(configured);

        assertArrayEquals(configured, config.allowedOrigins());
    }

    @Test
    void trimsWhitespaceAndDropsBlankEntries() {
        // Spring splits the property on commas before injection; stray spaces
        // around entries and empty entries (e.g. from a trailing comma)
        // must not invalidate the allow-list.
        String[] configured = {
                " https://geo-spatials-frontend.vercel.app ",
                "",
                "   ",
                "http://localhost:5173",
        };

        CorsConfig config = new CorsConfig(configured);

        assertEquals(2, config.allowedOrigins().length);
        assertArrayEquals(
                new String[]{"https://geo-spatials-frontend.vercel.app", "http://localhost:5173"},
                config.allowedOrigins());
    }
}
