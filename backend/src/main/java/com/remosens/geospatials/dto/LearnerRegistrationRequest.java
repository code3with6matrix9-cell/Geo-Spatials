package com.remosens.geospatials.dto;

import com.remosens.geospatials.enums.ExperienceLevel;
import com.remosens.geospatials.enums.LearnerStatus;
import com.remosens.geospatials.enums.LearningGoal;
import com.remosens.geospatials.enums.LearningMode;
import com.remosens.geospatials.enums.Technology;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.Set;

public record LearnerRegistrationRequest(
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

        @NotEmpty(message = "Choose at least one technology")
        Set<@NotNull(message = "Technology cannot be empty") Technology> technologies,

        @NotNull(message = "Agree to be contacted so we can reach you before launch")
        @AssertTrue(message = "Agree to be contacted so we can reach you before launch")
        Boolean consentToContact,

        Boolean notifyOnLaunch,

        @NotNull(message = "Choose your current status")
        LearnerStatus currentStatus,

        @NotBlank(message = "Enter your college, university or organisation")
        @Size(max = 150, message = "Keep this under 150 characters")
        String institution,

        @Size(max = 150, message = "Keep this under 150 characters")
        String fieldOfStudy,

        @NotNull(message = "Choose your experience level")
        ExperienceLevel experienceLevel,

        @NotNull(message = "Choose how you want to learn")
        LearningMode learningMode,

        @NotNull(message = "Choose your main goal")
        LearningGoal learningGoal
) implements RegistrationRequest {
}
