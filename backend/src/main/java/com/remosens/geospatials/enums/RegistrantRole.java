package com.remosens.geospatials.enums;

public enum RegistrantRole {
    LEARNER("learner"),
    EXPERT("expert"),
    PARTNER("partner"),
    ORGANISATION("organisation");

    private final String label;

    RegistrantRole(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** English article to use before the label, e.g. "an expert". */
    public String article() {
        return this == EXPERT || this == ORGANISATION ? "an" : "a";
    }
}
