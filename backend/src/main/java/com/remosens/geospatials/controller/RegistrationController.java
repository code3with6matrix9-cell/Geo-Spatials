package com.remosens.geospatials.controller;

import com.remosens.geospatials.dto.ExpertRegistrationRequest;
import com.remosens.geospatials.dto.LearnerRegistrationRequest;
import com.remosens.geospatials.dto.OrganisationRegistrationRequest;
import com.remosens.geospatials.dto.PartnerRegistrationRequest;
import com.remosens.geospatials.dto.RegistrationResponse;
import com.remosens.geospatials.service.ExpertRegistrationService;
import com.remosens.geospatials.service.LearnerRegistrationService;
import com.remosens.geospatials.service.OrganisationRegistrationService;
import com.remosens.geospatials.service.PartnerRegistrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/registrations")
@RequiredArgsConstructor
public class RegistrationController {

    private final LearnerRegistrationService learnerService;
    private final ExpertRegistrationService expertService;
    private final PartnerRegistrationService partnerService;
    private final OrganisationRegistrationService organisationService;

    @PostMapping("/learners")
    @ResponseStatus(HttpStatus.CREATED)
    public RegistrationResponse registerLearner(@Valid @RequestBody LearnerRegistrationRequest request) {
        return learnerService.register(request);
    }

    @PostMapping("/experts")
    @ResponseStatus(HttpStatus.CREATED)
    public RegistrationResponse registerExpert(@Valid @RequestBody ExpertRegistrationRequest request) {
        return expertService.register(request);
    }

    @PostMapping("/partners")
    @ResponseStatus(HttpStatus.CREATED)
    public RegistrationResponse registerPartner(@Valid @RequestBody PartnerRegistrationRequest request) {
        return partnerService.register(request);
    }

    @PostMapping("/organisations")
    @ResponseStatus(HttpStatus.CREATED)
    public RegistrationResponse registerOrganisation(@Valid @RequestBody OrganisationRegistrationRequest request) {
        return organisationService.register(request);
    }
}
