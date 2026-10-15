package com.remosens.geospatials.converter;

import com.remosens.geospatials.enums.OpportunityType;
import jakarta.persistence.Converter;

@Converter
public class OpportunityTypeSetConverter extends EnumSetConverter<OpportunityType> {

    public OpportunityTypeSetConverter() {
        super(OpportunityType.class);
    }
}
