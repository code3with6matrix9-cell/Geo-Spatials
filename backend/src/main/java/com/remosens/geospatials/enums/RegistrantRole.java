package com.remosens.geospatials.enums;

public enum RegistrantRole {
    LEARNER("learner"),
    EXPERT("expert"),
    PARTNER("partner");

    private final String label;

    RegistrantRole(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }
}
