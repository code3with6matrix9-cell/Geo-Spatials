package com.remosens.geospatials.dto;

import com.remosens.geospatials.enums.OpportunityType;
import com.remosens.geospatials.enums.OrganisationType;
import com.remosens.geospatials.enums.Sector;
import com.remosens.geospatials.enums.Technology;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Set;

/** fullName is the contact person at the organisation. */
public record PartnerRegistrationRequest(
        @NotBlank(message = "Enter the contact person's name")
        @Size(max = 120, message = "Keep the name under 120 characters")
        String fullName,

        @NotBlank(message = "Enter a work email address")
        @Email(regexp = ValidationPatterns.EMAIL, message = "Enter a valid email address")
        @Size(max = 254, message = "Email address is too long")
        String email,

        @Pattern(regexp = ValidationPatterns.PHONE, message = "Enter a valid phone number")
        String phone,

        @NotBlank(message = "Enter the city")
        @Size(max = 80, message = "Keep the city under 80 characters")
        String city,

        @Size(max = 80, message = "Keep the state under 80 characters")
        String state,

        @NotBlank(message = "Enter the country")
        @Size(max = 80, message = "Keep the country under 80 characters")
        String country,

        @NotEmpty(message = "Choose at least one technology")
        Set<@NotNull(message = "Technology cannot be empty") Technology> technologies,

        @NotNull(message = "Agree to be contacted so we can reach you before launch")
        @AssertTrue(message = "Agree to be contacted so we can reach you before launch")
        Boolean consentToContact,

        Boolean notifyOnLaunch,

        @NotBlank(message = "Enter your organisation name")
        @Size(max = 150, message = "Keep this under 150 characters")
        String organisationName,

        @NotNull(message = "Choose your organisation type")
        OrganisationType organisationType,

        @NotBlank(message = "Enter your designation")
        @Size(max = 120, message = "Keep this under 120 characters")
        String designation,

        @Pattern(regexp = ValidationPatterns.HTTP_URL, message = "Enter a full link starting with http:// or https://")
        @Size(max = 300, message = "Link is too long")
        String website,

        @NotEmpty(message = "Choose at least one sector")
        Set<@NotNull(message = "Sector cannot be empty") Sector> sectors,

        @NotEmpty(message = "Choose at least one opportunity type")
        Set<@NotNull(message = "Opportunity type cannot be empty") OpportunityType> opportunityTypes,

        @Size(max = 600, message = "Keep this under 600 characters")
        String hiringNeeds
) implements RegistrationRequest {
}
