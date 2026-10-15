
/* Modern registration experience, based on the supplied React frontend's role-first flow and API contract. */
(function () {
  const API_BASE = (
  window.GEOSPATIALS_API_BASE ||
  "https://geo-spatials-production-2026.onrender.com"
).replace(/\/$/, "");
  const modal = document.getElementById("reg-modal"),
    body = document.getElementById("reg-body"),
    foot = document.getElementById("reg-foot"),
    title = document.getElementById("reg-title"),
    sub = document.getElementById("reg-sub"),
    close = document.getElementById("reg-close");
  const roleDefs = {
    learner: {
      label: "Learner",
      summary:
        "Student, graduate or working professional who wants to learn.",
      endpoint: "learners",
      title: "Register as a learner",
      groups: [
        [
          "About you",
          [
            ["fullName", "Full name", "text", 1],
            ["email", "Email", "email", 1],
            ["phone", "Phone", "tel", 0],
          ],
        ],
        [
          "Your background",
          [
            [
              "currentStatus",
              "Current status",
              "select",
              1,
              [
                "UNDERGRADUATE|Undergraduate student",
                "POSTGRADUATE|Postgraduate student",
                "RESEARCH_SCHOLAR|Research scholar",
                "FACULTY|Faculty member",
                "WORKING_PROFESSIONAL|Working professional",
                "OTHER|Other",
              ],
            ],
            [
              "experienceLevel",
              "Geospatial experience",
              "select",
              1,
              [
                "BEGINNER|Beginner",
                "INTERMEDIATE|Intermediate",
                "ADVANCED|Advanced",
              ],
            ],
            [
              "institution",
              "College, university or organisation",
              "text",
              1,
            ],
            ["fieldOfStudy", "Field of study or work", "text", 0],
          ],
        ],
        [
          "Where you are based",
          [
            ["city", "City", "text", 1],
            ["state", "State", "text", 0],
            ["country", "Country", "text", 1, "India"],
          ],
        ],
        [
          "What you want to learn",
          [
            [
              "technologies",
              "Technologies you want to learn",
              "chips",
              1,
              "tech",
            ],
            [
              "learningMode",
              "How you want to learn",
              "select",
              1,
              ["ONLINE|Online", "OFFLINE|Offline", "HYBRID|Hybrid"],
            ],
            [
              "learningGoal",
              "Main goal",
              "select",
              1,
              [
                "START_CAREER|Start my geospatial career",
                "UPSKILL|Upskill in my current job",
                "CHANGE_FIELD|Move into geospatial from another field",
                "ACADEMIC_RESEARCH|Academic or research work",
              ],
            ],
          ],
        ],
      ],
    },
    expert: {
      label: "Expert",
      summary:
        "Trainer or industry practitioner who wants to teach and publish.",
      endpoint: "experts",
      title: "Register as an expert",
      groups: [
        [
          "About you",
          [
            ["fullName", "Full name", "text", 1],
            ["email", "Email", "email", 1],
            ["phone", "Phone", "tel", 0],
          ],
        ],
        [
          "Your practice",
          [
            ["designation", "Current designation", "text", 1],
            ["organisation", "Organisation", "text", 1],
            ["yearsOfExperience", "Years of experience", "number", 1],
            ["linkedinUrl", "LinkedIn profile", "url", 0],
            ["portfolioUrl", "Portfolio or website", "url", 0],
            ["bio", "Short bio", "textarea", 0],
          ],
        ],
        [
          "Where you are based",
          [
            ["city", "City", "text", 1],
            ["state", "State", "text", 0],
            ["country", "Country", "text", 1, "India"],
          ],
        ],
        [
          "What you can teach",
          [
            [
              "technologies",
              "Your areas of expertise",
              "chips",
              1,
              "tech",
            ],
            [
              "teachingFormats",
              "How you want to teach",
              "chips",
              1,
              [
                "COURSE|Courses",
                "BOOTCAMP|Bootcamps",
                "WORKSHOP|Workshops",
                "WEBINAR|Webinars",
                "LIVE_PROJECT|Live projects",
              ],
            ],
          ],
        ],
      ],
    },
    partner: {
      label: "Partner",
      summary:
        "Company, institution or agency that wants to hire or collaborate.",
      endpoint: "partners",
      title: "Register as a partner",
      groups: [
        [
          "Contact person",
          [
            ["fullName", "Full name", "text", 1],
            ["email", "Work email", "email", 1],
            ["phone", "Phone", "tel", 0],
          ],
        ],
        [
          "Your organisation",
          [
            ["organisationName", "Organisation name", "text", 1],
            [
              "organisationType",
              "Organisation type",
              "select",
              1,
              [
                "COMPANY|Company",
                "STARTUP|Startup",
                "GOVERNMENT|Government body",
                "ACADEMIC_INSTITUTION|College or university",
                "NGO|NGO or non-profit",
                "OTHER|Other",
              ],
            ],
            ["designation", "Your designation", "text", 1],
            ["website", "Website", "url", 0],
          ],
        ],
        [
          "Where you are based",
          [
            ["city", "City", "text", 1],
            ["state", "State", "text", 0],
            ["country", "Country", "text", 1, "India"],
          ],
        ],
        [
          "What you are looking for",
          [
            [
              "technologies",
              "Technologies your team works with",
              "chips",
              1,
              "tech",
            ],
            [
              "sectors",
              "Sectors you work in",
              "chips",
              1,
              [
                "URBAN_PLANNING|Urban planning",
                "AGRICULTURE|Agriculture",
                "POWER_UTILITIES|Power and utilities",
                "WATER_DRAINAGE|Water supply and drainage",
                "LAND_RECORDS|Land and property records",
                "INFRASTRUCTURE|Infrastructure",
                "FORESTRY_WILDLIFE|Forestry and wildlife",
                "ENVIRONMENT|Environment",
                "DISASTER_MANAGEMENT|Disaster management",
                "SMART_CITIES|Smart cities",
              ],
            ],
            [
              "opportunityTypes",
              "What you plan to offer",
              "chips",
              1,
              [
                "JOB|Jobs",
                "INTERNSHIP|Internships",
                "LIVE_PROJECT|Live projects",
                "CHALLENGE|Challenges",
                "CO_CREATE_TRAINING|Co-created training",
              ],
            ],
            ["hiringNeeds", "Skills or roles you need", "textarea", 0],
          ],
        ],
      ],
    },
  };
  const tech = [
    "GIS|GIS and spatial analysis",
    "REMOTE_SENSING|Remote sensing",
    "DRONE_UAV|Drone / UAV mapping",
    "PHOTOGRAMMETRY|Photogrammetry",
    "LIDAR|LiDAR and point clouds",
    "SURVEYING_GNSS|Surveying and GNSS",
    "GEOAI|GeoAI and machine learning",
    "WEB_GIS|Web GIS and spatial databases",
    "DIGITAL_TWINS|Digital twins",
  ];
  let selectedRole = null,
    previousFocus = null;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function open(role) {
    previousFocus = document.activeElement;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (role && roleDefs[role]) renderForm(role);
    else renderChoices();
  }
  function shut() {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (previousFocus && previousFocus.focus) previousFocus.focus();
  }
  function renderChoices() {
    selectedRole = null;
    title.textContent = "Register your interest";
    sub.textContent = "Tell us how you would like to use GEOSPATIALS.";
    foot.hidden = true;
    body.innerHTML =
      '<div class="reg-roles">' +
      Object.entries(roleDefs)
        .map(
          ([k, r]) =>
            '<button class="reg-role" data-choose="' +
            k +
            '"><span><strong>' +
            r.label +
            "</strong><small>" +
            r.summary +
            '</small></span><span aria-hidden="true">›</span></button>',
        )
        .join("") +
      "</div>";
  }
  function renderForm(key) {
    selectedRole = key;
    let r = roleDefs[key];
    title.textContent = r.title;
    sub.textContent =
      "Takes about a minute. We will contact you before launch.";
    foot.hidden = false;
    foot.innerHTML =
      '<button class="btn o sm reg-back" type="button" id="reg-back">← Back</button><button class="btn sm" type="submit" form="role-form" id="reg-submit">' +
      r.title +
      " ↗</button>";
    let html =
      '<form id="role-form" novalidate><div id="reg-form-error"></div>';
    r.groups.forEach((g, gi) => {
      html +=
        '<section class="reg-group"><h3>' +
        g[0] +
        '</h3><div class="reg-grid">';
      g[1].forEach((f) => {
        let [name, label, type, required, options] = f,
          full = [
            "institution",
            "fieldOfStudy",
            "bio",
            "portfolioUrl",
            "technologies",
            "teachingFormats",
            "sectors",
            "opportunityTypes",
            "hiringNeeds",
          ].includes(name);
        html +=
          '<div class="reg-field ' +
          (full ? "reg-full" : "") +
          '"><label for="rf-' +
          name +
          '">' +
          label +
          (required ? ' <span style="color:#f0c95c">*</span>' : "") +
          "</label>";
        if (type === "select") {
          let opts = options || [];
          html +=
            '<select id="rf-' +
            name +
            '" name="' +
            name +
            '" ' +
            (required ? "required" : "") +
            '><option value="">Select</option>' +
            opts
              .map((o) => {
                let [v, l] = o.split("|");
                return '<option value="' + v + '">' + l + "</option>";
              })
              .join("") +
            "</select>";
        } else if (type === "chips") {
          let opts = options === "tech" ? tech : options;
          html +=
            '<div class="reg-chips" data-chip-group="' +
            name +
            '">' +
            opts
              .map((o) => {
                let [v, l] = o.split("|");
                return (
                  '<button type="button" class="reg-chip" data-value="' +
                  v +
                  '" aria-pressed="false">' +
                  l +
                  "</button>"
                );
              })
              .join("") +
            '</div><input type="hidden" name="' +
            name +
            '" ' +
            (required ? "required" : "") +
            ">";
        } else if (type === "textarea")
          html +=
            '<textarea id="rf-' +
            name +
            '" name="' +
            name +
            '" maxlength="600" ' +
            (required ? "required" : "") +
            "></textarea>";
        else
          html +=
            '<input id="rf-' +
            name +
            '" name="' +
            name +
            '" type="' +
            type +
            '" ' +
            (required ? "required" : "") +
            (type === "number" ? ' min="0" max="60"' : "") +
            (name === "country" ? ' value="India"' : "") +
            ">";
        html += "</div>";
      });
      html += "</div></section>";
    });
    html +=
      '<section class="reg-group"><h3>Stay in the loop</h3><label class="reg-check"><input type="checkbox" name="notifyOnLaunch" checked><span>Notify me when GEOSPATIALS launches.</span></label><label class="reg-check"><input type="checkbox" name="consentToContact" required><span>I agree to be contacted by Remosens Private Limited about GEOSPATIALS launch updates and early access. <b style="color:#f0c95c">Required</b></span></label></section></form>';
    body.innerHTML = html;
  }
  body.addEventListener("click", (e) => {
    let choose = e.target.closest("[data-choose]");
    if (choose) {
      renderForm(choose.dataset.choose);
      return;
    }
    let chip = e.target.closest(".reg-chip");
    if (chip) {
      chip.setAttribute(
        "aria-pressed",
        chip.getAttribute("aria-pressed") !== "true",
      );
      let group = chip.closest("[data-chip-group]"),
        hidden = group.parentElement.querySelector("input[type=hidden]");
      hidden.value = [...group.querySelectorAll("[aria-pressed=true]")]
        .map((x) => x.dataset.value)
        .join(",");
      return;
    }
    if (e.target.closest("#reg-back")) renderChoices();
  });
  body.addEventListener("submit", async (e) => {
    if (e.target.id !== "role-form") return;
    e.preventDefault();
    let form = e.target,
      r = roleDefs[selectedRole],
      submit = document.getElementById("reg-submit"),
      err = document.getElementById("reg-form-error");
    err.innerHTML = "";
    let invalid = form.querySelector(
      "input:not([type=hidden]):invalid,select:invalid,textarea:invalid",
    );
    let missingChip = [
      ...form.querySelectorAll("[data-chip-group]"),
    ].find(
      (g) =>
        g.parentElement.querySelector("input[type=hidden][required]") &&
        !g.querySelector("[aria-pressed=true]"),
    );
    if (invalid || missingChip) {
      if (missingChip) {
        err.innerHTML =
          '<div class="reg-banner">Please choose at least one option for ' +
          missingChip.dataset.chipGroup.replace(/([A-Z])/g, " $1") +
          ".</div>";
        missingChip.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
      } else {
        invalid.focus();
        err.innerHTML =
          '<div class="reg-banner">Please complete the required fields and check your consent.</div>';
      }
      return;
    }
    let payload = {};
    new FormData(form).forEach((v, k) => {
      if (k === "notifyOnLaunch" || k === "consentToContact")
        payload[k] = v === "on";
      else if (v !== "" && v != null) {
        let field = form.elements[k];
        if (field && field.type === "number") payload[k] = Number(v);
        else if (
          [
            "technologies",
            "sectors",
            "teachingFormats",
            "opportunityTypes",
          ].includes(k)
        )
          payload[k] = String(v).split(",").filter(Boolean);
        else payload[k] = String(v).trim();
      }
    });
    payload.notifyOnLaunch = form.elements.notifyOnLaunch.checked;
    payload.consentToContact = form.elements.consentToContact.checked;
    submit.disabled = true;
    submit.textContent = "Registering…";
    try {
      let response = await fetch(
        API_BASE + "/api/v1/registrations/" + r.endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      let result = await response.json().catch(() => null);
      if (!response.ok) {
        let message =
          result?.message ||
          "Something went wrong while saving your details. Try again in a moment.";
        throw new Error(message);
      }
      title.textContent = "You are on the list";
      sub.textContent = "Registration submitted successfully.";
      body.innerHTML =
        '<div class="reg-done"><span class="done-check">✓</span><p style="font-size:18px;font-weight:600;color:#f1f5f9;margin-bottom:8px">' +
        esc(result?.message || "Thanks for registering your interest.") +
        '</p><p>We will contact you with GEOSPATIALS launch updates and early access.</p><button class="btn sm" id="reg-done-close" style="margin-top:24px">Done</button></div>';
      foot.hidden = true;
    } catch (error) {
      err.innerHTML =
        '<div class="reg-banner">' +
        esc(
          error.message ||
          "We could not reach the server. Check your connection and try again.",
        ) +
        "</div>";
      submit.disabled = false;
      submit.textContent = r.title + " ↗";
    }
  });
  close.addEventListener("click", shut);
  modal.addEventListener("mousedown", (e) => {
    if (e.target === modal) shut();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) shut();
  });
  body.addEventListener("click", (e) => {
    if (e.target.closest("#reg-done-close")) shut();
  });
  document.querySelectorAll("[data-open-register]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      let role = null;
      let label = (a.textContent || "").toLowerCase();
      if (label.includes("expert")) role = "expert";
      else if (label.includes("partner")) role = "partner";
      else if (label.includes("learner")) role = "learner";
      open(role);
    }),
  );
  // Replace vector placeholders with realistic, topic-matched imagery.
  const imgs = {
    sat: {
      src: "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&w=1200&q=85",
      alt: "Satellite view of Earth from orbit",
    },
    drone: {
      src: "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=1200&q=85",
      alt: "Drone flying above a landscape",
    },
    net: {
      src: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1200&q=85",
      alt: "People collaborating across professional disciplines",
    },
    layers: {
      src: "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=1200&q=85",
      alt: "Satellite imagery and Earth observation",
    },
    contour: {
      src: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85",
      alt: "Terrain and landscape mapping",
    },
  };
  document.querySelectorAll("[data-art]").forEach((el) => {
    let im = imgs[el.dataset.art] || imgs.sat;
    el.innerHTML =
      '<img loading="lazy" src="' + im.src + '" alt="' + im.alt + '">';
  });
  const commitImgs = [
    [
      "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80",
      "Expert-led learning",
    ],
    [
      "https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=900&q=80",
      "Drone field practice",
    ],
    [
      "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=900&q=80",
      "Verified credentials and achievement",
    ],
    [
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
      "Portfolio and analytics",
    ],
    [
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=80",
      "Industry collaboration",
    ],
    [
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=900&q=80",
      "Geospatial technology and trust",
    ],
  ];
  // Correct URLs below use stable Unsplash image IDs; avoid relying on third-party page redirects.
  commitImgs[0][0] =
    "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80";
  commitImgs[3][0] =
    "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80";
  document.querySelectorAll("#pil .tc").forEach((card, i) => {
    let im = commitImgs[i];
    if (!im) return;
    let photo = document.createElement("div");
    photo.className = "commit-photo";
    photo.innerHTML =
      '<img loading="lazy" src="' + im[0] + '" alt="' + im[1] + '">';
    card.prepend(photo);
  });
  const audienceImgs = [
    [
      "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80",
      "Students learning together",
    ],
    [
      "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=900&q=80",
      "Professionals learning together",
    ],
    [
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=900&q=80",
      "Experts collaborating",
    ],
    [
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80",
      "Industry and organisation partners",
    ],
  ];
  document.querySelectorAll(".roles3 .glass").forEach((card, i) => {
    let im = audienceImgs[i];
    if (!im) return;
    let photo = document.createElement("div");
    photo.className = "role-photo";
    photo.innerHTML =
      '<img loading="lazy" src="' + im[0] + '" alt="' + im[1] + '">';
    card.prepend(photo);
  });
  const contactImgs = [
    "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80",
  ];
  document.querySelectorAll("#contact .ct .glass").forEach((card, i) => {
    let photo = document.createElement("div");
    photo.className = "contact-visual";
    photo.innerHTML =
      '<img loading="lazy" src="' + contactImgs[i] + '" alt="">';
    card.prepend(photo);
  });
  // Use a gentler scroll-led reveal, and remove cursor-driven camera movement that can feel disorienting.
  document
    .querySelectorAll(".rv")
    .forEach((el, i) =>
      el.style.setProperty(
        "--reveal-delay",
        Math.min(i % 4, 3) * 65 + "ms",
      ),
    );
})();
