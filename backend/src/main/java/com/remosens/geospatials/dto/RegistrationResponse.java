package com.remosens.geospatials.dto;

import com.remosens.geospatials.enums.RegistrantRole;

import java.time.Instant;
import java.util.UUID;

public record RegistrationResponse(
        UUID id,
        RegistrantRole role,
        String fullName,
        String email,
        boolean notifyOnLaunch,
        Instant registeredAt,
        String message
) {
}
