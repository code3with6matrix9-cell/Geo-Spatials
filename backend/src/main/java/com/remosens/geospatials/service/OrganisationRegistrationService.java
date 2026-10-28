package com.remosens.geospatials.service;

import com.remosens.geospatials.dto.OrganisationRegistrationRequest;
import com.remosens.geospatials.dto.RegistrationResponse;
import com.remosens.geospatials.entity.Organisation;
import com.remosens.geospatials.enums.RegistrantRole;
import com.remosens.geospatials.exception.DuplicateRegistrationException;
import com.remosens.geospatials.mapper.RegistrationMapper;
import com.remosens.geospatials.repository.OrganisationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrganisationRegistrationService {

    private final OrganisationRepository repository;

    @Transactional
    public RegistrationResponse register(OrganisationRegistrationRequest request) {
        String email = RegistrationMapper.normalizeEmail(request.email());
        if (repository.existsByEmailIgnoreCase(email)) {
            throw new DuplicateRegistrationException(RegistrantRole.ORGANISATION, email);
        }
        Organisation saved = repository.save(RegistrationMapper.toEntity(request));
        log.info("New {} registration saved, id={}", RegistrantRole.ORGANISATION.label(), saved.getId());
        return RegistrationMapper.toResponse(saved, RegistrantRole.ORGANISATION);
    }
}
