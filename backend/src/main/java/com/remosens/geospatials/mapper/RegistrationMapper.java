package com.remosens.geospatials.mapper;

import com.remosens.geospatials.dto.ExpertRegistrationRequest;
import com.remosens.geospatials.dto.LearnerRegistrationRequest;
import com.remosens.geospatials.dto.PartnerRegistrationRequest;
import com.remosens.geospatials.dto.RegistrationRequest;
import com.remosens.geospatials.dto.RegistrationResponse;
import com.remosens.geospatials.entity.BaseRegistration;
import com.remosens.geospatials.entity.Expert;
import com.remosens.geospatials.entity.Learner;
import com.remosens.geospatials.entity.Partner;
import com.remosens.geospatials.enums.RegistrantRole;

import java.time.Instant;
import java.util.Locale;
import java.util.TreeSet;

/** Hand-written mapping between request DTOs, entities and the response DTO. */
public final class RegistrationMapper {

    private RegistrationMapper() {
    }

    public static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    public static Learner toEntity(LearnerRegistrationRequest r) {
        Learner e = new Learner();
        applyCommon(e, r);
        e.setCurrentStatus(r.currentStatus());
        e.setInstitution(r.institution().trim());
        e.setFieldOfStudy(clean(r.fieldOfStudy()));
        e.setExperienceLevel(r.experienceLevel());
        e.setLearningMode(r.learningMode());
        e.setLearningGoal(r.learningGoal());
        return e;
    }

    public static Expert toEntity(ExpertRegistrationRequest r) {
        Expert e = new Expert();
        applyCommon(e, r);
        e.setDesignation(r.designation().trim());
        e.setOrganisation(r.organisation().trim());
        e.setYearsOfExperience(r.yearsOfExperience());
        e.setTeachingFormats(new TreeSet<>(r.teachingFormats()));
        e.setLinkedinUrl(clean(r.linkedinUrl()));
        e.setPortfolioUrl(clean(r.portfolioUrl()));
        e.setBio(clean(r.bio()));
        return e;
    }

    public static Partner toEntity(PartnerRegistrationRequest r) {
        Partner e = new Partner();
        applyCommon(e, r);
        e.setOrganisationName(r.organisationName().trim());
        e.setOrganisationType(r.organisationType());
        e.setDesignation(r.designation().trim());
        e.setWebsite(clean(r.website()));
        e.setSectors(new TreeSet<>(r.sectors()));
        e.setOpportunityTypes(new TreeSet<>(r.opportunityTypes()));
        e.setHiringNeeds(clean(r.hiringNeeds()));
        return e;
    }

    public static RegistrationResponse toResponse(BaseRegistration e, RegistrantRole role) {
        StringBuilder message = new StringBuilder("You are on the early access list as ")
                .append(role == RegistrantRole.EXPERT ? "an " : "a ")
                .append(role.label())
                .append(". We will contact you before launch.");
        if (e.isNotifyOnLaunch()) {
            message.append(" We will also let you know the day GEOSPATIALS goes live.");
        }
        return new RegistrationResponse(
                e.getId(),
                role,
                e.getFullName(),
                e.getEmail(),
                e.isNotifyOnLaunch(),
                e.getCreatedAt() != null ? e.getCreatedAt() : Instant.now(),
                message.toString());
    }

    private static void applyCommon(BaseRegistration target, RegistrationRequest r) {
        target.setFullName(r.fullName().trim());
        target.setEmail(normalizeEmail(r.email()));
        target.setPhone(clean(r.phone()));
        target.setCity(r.city().trim());
        target.setState(clean(r.state()));
        target.setCountry(r.country().trim());
        target.setTechnologies(new TreeSet<>(r.technologies()));
        target.setConsentToContact(Boolean.TRUE.equals(r.consentToContact()));
        target.setNotifyOnLaunch(Boolean.TRUE.equals(r.notifyOnLaunch()));
    }

    private static String clean(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
