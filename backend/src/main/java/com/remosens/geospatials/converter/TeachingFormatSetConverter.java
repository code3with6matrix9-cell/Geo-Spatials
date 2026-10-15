package com.remosens.geospatials.converter;

import com.remosens.geospatials.enums.TeachingFormat;
import jakarta.persistence.Converter;

@Converter
public class TeachingFormatSetConverter extends EnumSetConverter<TeachingFormat> {

    public TeachingFormatSetConverter() {
        super(TeachingFormat.class);
    }
}
