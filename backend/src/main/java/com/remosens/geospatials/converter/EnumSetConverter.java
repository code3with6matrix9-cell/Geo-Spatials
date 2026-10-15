package com.remosens.geospatials.converter;

import jakarta.persistence.AttributeConverter;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Stores a Set of enum values as one comma-separated column, e.g. "GIS,LIDAR".
 * Keeps the schema to one table per role instead of a join table per multi-select.
 */
public abstract class EnumSetConverter<E extends Enum<E>> implements AttributeConverter<Set<E>, String> {

    private static final String SEPARATOR = ",";

    private final Class<E> type;

    protected EnumSetConverter(Class<E> type) {
        this.type = type;
    }

    @Override
    public String convertToDatabaseColumn(Set<E> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return "";
        }
        return attribute.stream().map(Enum::name).sorted().collect(Collectors.joining(SEPARATOR));
    }

    @Override
    public Set<E> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return EnumSet.noneOf(type);
        }
        return Arrays.stream(dbData.split(SEPARATOR))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(s -> Enum.valueOf(type, s))
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(type)));
    }
}
