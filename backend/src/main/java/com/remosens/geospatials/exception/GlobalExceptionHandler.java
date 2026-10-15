package com.remosens.geospatials.exception;

import com.remosens.geospatials.dto.ApiError;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.lang.Nullable;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(DuplicateRegistrationException.class)
    public ResponseEntity<ApiError> handleDuplicate(
            DuplicateRegistrationException ex,
            WebRequest request) {

        return respond(
                HttpStatus.CONFLICT,
                ex.getMessage(),
                request,
                Map.of("email", ex.getMessage())
        );
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDataIntegrity(
            DataIntegrityViolationException ex,
            WebRequest request) {

        log.warn(
                "Data integrity violation: {}",
                ex.getMostSpecificCause().getMessage()
        );

        return respond(
                HttpStatus.CONFLICT,
                "This email is already registered. Use a different email or wait for our launch message.",
                request,
                Map.of(
                        "email",
                        "This email is already registered"
                )
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(
            Exception ex,
            WebRequest request) {

        log.error("Unhandled exception", ex);

        return respond(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Something went wrong on our side. Please try again in a few minutes.",
                request,
                Collections.emptyMap()
        );
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {

        Map<String, String> fieldErrors = new LinkedHashMap<>();

        ex.getBindingResult()
                .getFieldErrors()
                .forEach(error -> fieldErrors.putIfAbsent(
                        topLevelField(error.getField()),
                        error.getDefaultMessage() != null
                                ? error.getDefaultMessage()
                                : "Invalid value"
                ));

        ApiError body = ApiError.of(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "Some fields need your attention. Correct them and try again.",
                path(request),
                fieldErrors
        );

        return new ResponseEntity<>(
                body,
                headers,
                HttpStatus.BAD_REQUEST
        );
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {

        log.debug("Invalid or unreadable request body", ex);

        ApiError body = ApiError.of(
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                "The request body is missing, contains invalid JSON, or has an invalid field value.",
                path(request),
                Collections.emptyMap()
        );

        return new ResponseEntity<>(
                body,
                headers,
                HttpStatus.BAD_REQUEST
        );
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex,
            @Nullable Object body,
            HttpHeaders headers,
            HttpStatusCode statusCode,
            WebRequest request) {

        HttpStatus status = HttpStatus.resolve(statusCode.value());

        String reason = status != null
                ? status.getReasonPhrase()
                : "Error";

        ApiError error = ApiError.of(
                statusCode.value(),
                reason,
                friendlyMessage(statusCode.value()),
                path(request),
                Collections.emptyMap()
        );

        return new ResponseEntity<>(
                error,
                headers,
                statusCode
        );
    }

    private ResponseEntity<ApiError> respond(
            HttpStatus status,
            String message,
            WebRequest request,
            Map<String, String> fieldErrors) {

        return ResponseEntity.status(status)
                .body(
                        ApiError.of(
                                status.value(),
                                status.getReasonPhrase(),
                                message,
                                path(request),
                                fieldErrors
                        )
                );
    }

    private static String path(WebRequest request) {
        if (request instanceof ServletWebRequest servletWebRequest) {
            return servletWebRequest.getRequest().getRequestURI();
        }

        return "";
    }

    private static String topLevelField(String field) {
        int bracket = field.indexOf('[');

        return bracket > 0
                ? field.substring(0, bracket)
                : field;
    }

    private static String friendlyMessage(int status) {
        return switch (status) {
            case 400 -> "The request contains invalid data. Please check your input.";
            case 404 -> "We could not find what you asked for.";
            case 405 -> "This action is not supported on this address.";
            case 415 -> "Send the request as JSON.";
            default -> "The request could not be completed.";
        };
    }
}