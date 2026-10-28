package com.remosens.geospatials.entity;

import com.remosens.geospatials.converter.CollaborationInterestSetConverter;
import com.remosens.geospatials.enums.CollaborationInterest;
import com.remosens.geospatials.enums.InstitutionType;
import com.remosens.geospatials.enums.RepresentativeDesignation;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.Set;
import java.util.TreeSet;

/**
 * An educational institution applying to collaborate with GEOSPATIALS.
 * fullName is the authorised representative; email is the official institutional email.
 */
@Getter
@Setter
@Entity
@Table(name = "organisations")
public class Organisation extends BaseRegistration {

    @Column(nullable = false, length = 150)
    private String institutionName;

    @Enumerated(EnumType.STRING)
    @Column(name = "institution_type", nullable = false, length = 30)
    private InstitutionType institutionType;

    @Column(name = "official_website", length = 300)
    private String officialWebsite;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40)
    private RepresentativeDesignation designation;

    @Convert(converter = CollaborationInterestSetConverter.class)
    @Column(name = "collaboration_interests", nullable = false, length = 255)
    private Set<CollaborationInterest> collaborationInterests = new TreeSet<>();

    @Column(length = 600)
    private String description;
}
