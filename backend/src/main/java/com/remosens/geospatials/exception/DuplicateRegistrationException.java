package com.remosens.geospatials.exception;

import com.remosens.geospatials.enums.RegistrantRole;
import lombok.Getter;

@Getter
public class DuplicateRegistrationException extends RuntimeException {

    private final RegistrantRole role;

    public DuplicateRegistrationException(RegistrantRole role, String email) {
        super("This email is already registered as " + (role == RegistrantRole.EXPERT ? "an " : "a ")
                + role.label() + ". Use a different email or wait for our launch message.");
        this.role = role;
    }
}
