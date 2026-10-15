package com.remosens.geospatials.repository;

import com.remosens.geospatials.entity.Partner;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface PartnerRepository extends JpaRepository<Partner, UUID> {

    boolean existsByEmailIgnoreCase(String email);
}
