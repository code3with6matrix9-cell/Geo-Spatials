package com.remosens.geospatials.dto;

import com.remosens.geospatials.enums.Technology;

import java.util.Set;

/** Fields common to the learner, expert and partner requests. */
public interface RegistrationRequest {

    String fullName();

    String email();

    String phone();

    String city();

    String state();

    String country();

    Set<Technology> technologies();

    Boolean consentToContact();

    Boolean notifyOnLaunch();
}
