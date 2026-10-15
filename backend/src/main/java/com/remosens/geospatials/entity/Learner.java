package com.remosens.geospatials.entity;

import com.remosens.geospatials.enums.ExperienceLevel;
import com.remosens.geospatials.enums.LearnerStatus;
import com.remosens.geospatials.enums.LearningGoal;
import com.remosens.geospatials.enums.LearningMode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "learners")
public class Learner extends BaseRegistration {

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private LearnerStatus currentStatus;

    /** College, university or employer. */
    @Column(nullable = false, length = 150)
    private String institution;

    @Column(length = 150)
    private String fieldOfStudy;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ExperienceLevel experienceLevel;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private LearningMode learningMode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private LearningGoal learningGoal;
}
