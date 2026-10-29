package com.remosens.geospatials.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * One concise log line per API request: method, path, status, duration and the
 * calling Origin. This makes registration traffic (and CORS rejections, which
 * arrive as unhandled OPTIONS returning 4xx) visible in Render logs without
 * logging request bodies or any personal data.
 */
@Slf4j
@Component
public class ApiRequestLoggingFilter extends OncePerRequestFilter {

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        long start = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = (System.nanoTime() - start) / 1_000_000;
            String origin = request.getHeader("Origin");
            String line = request.getMethod() + " " + request.getRequestURI()
                    + " -> " + response.getStatus()
                    + " (" + durationMs + " ms)"
                    + (origin != null ? " origin=" + origin : "");
            if (response.getStatus() >= 500) {
                log.error("API request failed: {}", line);
            } else {
                log.info("API request: {}", line);
            }
        }
    }
}
