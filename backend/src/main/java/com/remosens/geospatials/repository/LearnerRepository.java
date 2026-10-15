package com.remosens.geospatials.repository;

import com.remosens.geospatials.entity.Learner;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface LearnerRepository extends JpaRepository<Learner, UUID> {

    boolean existsByEmailIgnoreCase(String email);
}
