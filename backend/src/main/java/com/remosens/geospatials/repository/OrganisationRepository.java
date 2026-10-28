package com.remosens.geospatials.repository;

import com.remosens.geospatials.entity.Organisation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface OrganisationRepository extends JpaRepository<Organisation, UUID> {

    boolean existsByEmailIgnoreCase(String email);
}
