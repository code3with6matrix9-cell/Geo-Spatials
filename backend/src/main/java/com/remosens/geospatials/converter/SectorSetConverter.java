package com.remosens.geospatials.converter;

import com.remosens.geospatials.enums.Sector;
import jakarta.persistence.Converter;

@Converter
public class SectorSetConverter extends EnumSetConverter<Sector> {

    public SectorSetConverter() {
        super(Sector.class);
    }
}
