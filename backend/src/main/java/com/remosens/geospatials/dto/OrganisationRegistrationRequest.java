package com.remosens.geospatials.dto;

import com.remosens.geospatials.enums.CollaborationInterest;
import com.remosens.geospatials.enums.InstitutionType;
import com.remosens.geospatials.enums.RepresentativeDesignation;
import com.remosens.geospatials.enums.Technology;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Set;

/**
 * Institution registration application.
 * fullName is the authorised representative; email is the official institutional email.
 * technologies is optional here because the institution form does not collect a tech stack.
 */
public record OrganisationRegistrationRequest(
        @NotBlank(message = "Enter the authorised representative's name")
        @Size(max = 120, message = "Keep the name under 120 characters")
        String fullName,

        @NotBlank(message = "Enter the official institutional email")
        @Email(regexp = ValidationPatterns.EMAIL, message = "Enter a valid email address")
        @Size(max = 254, message = "Email address is too long")
        String email,

        @NotBlank(message = "Enter the representative's phone number")
        @Pattern(regexp = ValidationPatterns.PHONE, message = "Enter a valid phone number")
        String phone,

        @NotBlank(message = "Enter the city")
        @Size(max = 80, message = "Keep the city under 80 characters")
        String city,

        @NotBlank(message = "Enter the state")
        @Size(max = 80, message = "Keep the state under 80 characters")
        String state,

        @NotBlank(message = "Enter the country")
        @Size(max = 80, message = "Keep the country under 80 characters")
        String country,

        Set<@NotNull(message = "Technology cannot be empty") Technology> technologies,

        @NotNull(message = "Agree to be contacted so we can reach you")
        @AssertTrue(message = "Agree to be contacted so we can reach you")
        Boolean consentToContact,

        Boolean notifyOnLaunch,

        @NotBlank(message = "Enter the institution name")
        @Size(max = 150, message = "Keep the institution name under 150 characters")
        String institutionName,

        @NotNull(message = "Choose the institution type")
        InstitutionType institutionType,

        @Pattern(regexp = ValidationPatterns.HTTP_URL, message = "Enter a full link starting with http:// or https://")
        @Size(max = 300, message = "Link is too long")
        String officialWebsite,

        @NotNull(message = "Choose the representative's designation")
        RepresentativeDesignation designation,

        @NotEmpty(message = "Choose at least one collaboration interest")
        Set<@NotNull(message = "Collaboration interest cannot be empty") CollaborationInterest> collaborationInterests,

        @Size(max = 600, message = "Keep this under 600 characters")
        String description
) implements RegistrationRequest {
}
