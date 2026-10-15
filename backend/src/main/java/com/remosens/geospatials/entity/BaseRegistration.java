package com.remosens.geospatials.entity;

import com.remosens.geospatials.converter.TechnologySetConverter;
import com.remosens.geospatials.enums.Technology;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/** Fields every registrant shares, whatever their role. */
@Getter
@Setter
@MappedSuperclass
public abstract class BaseRegistration {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, length = 120)
    private String fullName;

    @Column(nullable = false, unique = true, length = 254)
    private String email;

    @Column(length = 20)
    private String phone;

    @Column(nullable = false, length = 80)
    private String city;

    @Column(length = 80)
    private String state;

    @Column(nullable = false, length = 80)
    private String country;

    @Convert(converter = TechnologySetConverter.class)
    @Column(name = "technologies", nullable = false, length = 255)
    private Set<Technology> technologies = new TreeSet<>();

    /** Agreed to be contacted by Remosens about launch and early access. Always true once saved. */
    @Column(nullable = false)
    private boolean consentToContact;

    /** Ticked "Notify me when GEOSPATIALS launches". */
    @Column(nullable = false)
    private boolean notifyOnLaunch;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private Instant updatedAt;
}
