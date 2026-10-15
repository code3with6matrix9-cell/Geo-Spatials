package com.remosens.geospatials.service;

import com.remosens.geospatials.dto.ExpertRegistrationRequest;
import com.remosens.geospatials.dto.RegistrationResponse;
import com.remosens.geospatials.entity.Expert;
import com.remosens.geospatials.enums.RegistrantRole;
import com.remosens.geospatials.exception.DuplicateRegistrationException;
import com.remosens.geospatials.mapper.RegistrationMapper;
import com.remosens.geospatials.repository.ExpertRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class ExpertRegistrationService {

    private final ExpertRepository repository;

    @Transactional
    public RegistrationResponse register(ExpertRegistrationRequest request) {
        String email = RegistrationMapper.normalizeEmail(request.email());
        if (repository.existsByEmailIgnoreCase(email)) {
            throw new DuplicateRegistrationException(RegistrantRole.EXPERT, email);
        }
        Expert saved = repository.save(RegistrationMapper.toEntity(request));
        log.info("New {} registration saved, id={}", RegistrantRole.EXPERT.label(), saved.getId());
        return RegistrationMapper.toResponse(saved, RegistrantRole.EXPERT);
    }
}
