package com.remosens.geospatials.service;

import com.remosens.geospatials.dto.LearnerRegistrationRequest;
import com.remosens.geospatials.dto.RegistrationResponse;
import com.remosens.geospatials.entity.Learner;
import com.remosens.geospatials.enums.RegistrantRole;
import com.remosens.geospatials.exception.DuplicateRegistrationException;
import com.remosens.geospatials.mapper.RegistrationMapper;
import com.remosens.geospatials.repository.LearnerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class LearnerRegistrationService {

    private final LearnerRepository repository;

    @Transactional
    public RegistrationResponse register(LearnerRegistrationRequest request) {
        String email = RegistrationMapper.normalizeEmail(request.email());
        if (repository.existsByEmailIgnoreCase(email)) {
            throw new DuplicateRegistrationException(RegistrantRole.LEARNER, email);
        }
        Learner saved = repository.save(RegistrationMapper.toEntity(request));
        log.info("New {} registration saved, id={}", RegistrantRole.LEARNER.label(), saved.getId());
        return RegistrationMapper.toResponse(saved, RegistrantRole.LEARNER);
    }
}
