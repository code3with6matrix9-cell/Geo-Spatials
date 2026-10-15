package com.remosens.geospatials.converter;

import com.remosens.geospatials.enums.Technology;
import jakarta.persistence.Converter;

@Converter
public class TechnologySetConverter extends EnumSetConverter<Technology> {

    public TechnologySetConverter() {
        super(Technology.class);
    }
}
