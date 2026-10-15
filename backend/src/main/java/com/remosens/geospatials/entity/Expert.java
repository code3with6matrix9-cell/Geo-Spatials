package com.remosens.geospatials.entity;

import com.remosens.geospatials.converter.TeachingFormatSetConverter;
import com.remosens.geospatials.enums.TeachingFormat;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.Set;
import java.util.TreeSet;

@Getter
@Setter
@Entity
@Table(name = "experts")
public class Expert extends BaseRegistration {

    @Column(nullable = false, length = 120)
    private String designation;

    @Column(nullable = false, length = 150)
    private String organisation;

    @Column(nullable = false)
    private int yearsOfExperience;

    @Convert(converter = TeachingFormatSetConverter.class)
    @Column(name = "teaching_formats", nullable = false, length = 255)
    private Set<TeachingFormat> teachingFormats = new TreeSet<>();

    @Column(length = 300)
    private String linkedinUrl;

    @Column(length = 300)
    private String portfolioUrl;

    @Column(length = 600)
    private String bio;
}
