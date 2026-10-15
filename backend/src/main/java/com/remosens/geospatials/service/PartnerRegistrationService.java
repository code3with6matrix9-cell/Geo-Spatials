package com.remosens.geospatials.service;

import com.remosens.geospatials.dto.PartnerRegistrationRequest;
import com.remosens.geospatials.dto.RegistrationResponse;
import com.remosens.geospatials.entity.Partner;
import com.remosens.geospatials.enums.RegistrantRole;
import com.remosens.geospatials.exception.DuplicateRegistrationException;
import com.remosens.geospatials.mapper.RegistrationMapper;
import com.remosens.geospatials.repository.PartnerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class PartnerRegistrationService {

    private final PartnerRepository repository;

    @Transactional
    public RegistrationResponse register(PartnerRegistrationRequest request) {
        String email = RegistrationMapper.normalizeEmail(request.email());
        if (repository.existsByEmailIgnoreCase(email)) {
            throw new DuplicateRegistrationException(RegistrantRole.PARTNER, email);
        }
        Partner saved = repository.save(RegistrationMapper.toEntity(request));
        log.info("New {} registration saved, id={}", RegistrantRole.PARTNER.label(), saved.getId());
        return RegistrationMapper.toResponse(saved, RegistrantRole.PARTNER);
    }
}
