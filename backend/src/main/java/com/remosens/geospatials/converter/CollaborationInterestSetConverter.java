package com.remosens.geospatials.converter;

import com.remosens.geospatials.enums.CollaborationInterest;
import jakarta.persistence.Converter;

@Converter
public class CollaborationInterestSetConverter extends EnumSetConverter<CollaborationInterest> {

    public CollaborationInterestSetConverter() {
        super(CollaborationInterest.class);
    }
}
