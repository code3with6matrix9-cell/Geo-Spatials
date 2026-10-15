package com.remosens.geospatials.entity;

import com.remosens.geospatials.converter.OpportunityTypeSetConverter;
import com.remosens.geospatials.converter.SectorSetConverter;
import com.remosens.geospatials.enums.OpportunityType;
import com.remosens.geospatials.enums.OrganisationType;
import com.remosens.geospatials.enums.Sector;
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

/** An organisation that wants to hire, post projects or co-create training. fullName is the contact person. */
@Getter
@Setter
@Entity
@Table(name = "partners")
public class Partner extends BaseRegistration {

    @Column(nullable = false, length = 150)
    private String organisationName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private OrganisationType organisationType;

    @Column(nullable = false, length = 120)
    private String designation;

    @Column(length = 300)
    private String website;

    @Convert(converter = SectorSetConverter.class)
    @Column(name = "sectors", nullable = false, length = 255)
    private Set<Sector> sectors = new TreeSet<>();

    @Convert(converter = OpportunityTypeSetConverter.class)
    @Column(name = "opportunity_types", nullable = false, length = 255)
    private Set<OpportunityType> opportunityTypes = new TreeSet<>();

    @Column(length = 600)
    private String hiringNeeds;
}
