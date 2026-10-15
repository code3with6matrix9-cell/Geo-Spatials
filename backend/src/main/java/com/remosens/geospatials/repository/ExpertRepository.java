package com.remosens.geospatials.repository;

import com.remosens.geospatials.entity.Expert;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ExpertRepository extends JpaRepository<Expert, UUID> {

    boolean existsByEmailIgnoreCase(String email);
}
