package com.remosens.geospatials.dto;

import com.remosens.geospatials.enums.TeachingFormat;
import com.remosens.geospatials.enums.Technology;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record ExpertRegistrationRequest(
        @NotBlank(message = "Enter your full name")
        @Size(max = 120, message = "Keep your name under 120 characters")
        String fullName,

        @NotBlank(message = "Enter your email address")
        @Email(regexp = ValidationPatterns.EMAIL, message = "Enter a valid email address")
        @Size(max = 254, message = "Email address is too long")
        String email,

        @Pattern(regexp = ValidationPatterns.PHONE, message = "Enter a valid phone number")
        String phone,

        @NotBlank(message = "Enter your city")
        @Size(max = 80, message = "Keep the city under 80 characters")
        String city,

        @Size(max = 80, message = "Keep the state under 80 characters")
        String state,

        @NotBlank(message = "Enter your country")
        @Size(max = 80, message = "Keep the country under 80 characters")
        String country,

        @NotEmpty(message = "Choose at least one area of expertise")
        Set<@NotNull(message = "Technology cannot be empty") Technology> technologies,

        @NotNull(message = "Agree to be contacted so we can reach you before launch")
        @AssertTrue(message = "Agree to be contacted so we can reach you before launch")
        Boolean consentToContact,

        Boolean notifyOnLaunch,

        @NotBlank(message = "Enter your current designation")
        @Size(max = 120, message = "Keep this under 120 characters")
        String designation,

        @NotBlank(message = "Enter your organisation")
        @Size(max = 150, message = "Keep this under 150 characters")
        String organisation,

        @NotNull(message = "Enter your years of experience")
        @Min(value = 0, message = "Years of experience cannot be negative")
        @Max(value = 60, message = "Enter a number up to 60")
        Integer yearsOfExperience,

        @NotEmpty(message = "Choose at least one way you want to teach")
        Set<@NotNull(message = "Teaching format cannot be empty") TeachingFormat> teachingFormats,

        @Pattern(regexp = ValidationPatterns.HTTP_URL, message = "Enter a full link starting with http:// or https://")
        @Size(max = 300, message = "Link is too long")
        String linkedinUrl,

        @Pattern(regexp = ValidationPatterns.HTTP_URL, message = "Enter a full link starting with http:// or https://")
        @Size(max = 300, message = "Link is too long")
        String portfolioUrl,

        @Size(max = 600, message = "Keep your bio under 600 characters")
        String bio
) implements RegistrationRequest {
}
