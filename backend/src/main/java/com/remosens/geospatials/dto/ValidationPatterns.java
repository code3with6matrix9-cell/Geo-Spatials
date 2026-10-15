package com.remosens.geospatials.dto;

/** Regexes shared by the request DTOs. The React form uses the same rules. */
public final class ValidationPatterns {

    public static final String EMAIL = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
    public static final String PHONE = "^\\+?[0-9][0-9\\s-]{6,17}$";
    public static final String HTTP_URL = "^https?://\\S+$";

    private ValidationPatterns() {
    }
}
