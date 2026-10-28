// Project-wide vocabularies. Edit here; the forms and the codebook read from this file.

// A paper is approved once this many people voted Include (and nobody voted Exclude),
// and rejected once this many voted Exclude (and nobody voted Include).
export const VOTES_REQUIRED = 2;

export const EXCLUSION_REASONS = [
  "Not a United States study",
  "Not school-based",
  "Not a behavioral health intervention",
  "Not an RCT or strong quasi-experiment",
  "Participants outside ages 5 to 25",
  "No eligible outcome (engagement, mental health or behavior, discipline)",
  "Not an empirical evaluation (review, commentary, protocol)",
  "Duplicate record",
  "Other (explain in notes)",
];

export const STUDY_DESIGNS = ["RCT", "Cluster RCT", "Quasi-experiment (matched or controlled)", "Other"];
export const TARGETING_LEVELS = ["Universal", "Selective", "Indicated", "Mixed or unclear"];
export const CULTURAL_ADAPTATION = ["No", "Yes", "Unclear"];
export const ADAPTATION_DEPTH = ["Not reported", "Surface (language, images, examples)", "Deep (values, goals, methods, context)", "Both"];
export const DELIVERY_AGENTS = ["Clinician", "Teacher or school staff", "Peer", "Mixed", "Other or unclear"];
export const RISK_OF_BIAS = ["Low", "Some concerns", "High", "Not assessed"];
export const SETTINGS = ["Elementary", "Middle", "High school", "College or post-secondary", "Mixed"];
export const REPORTING_LEVELS = [
  "None (no results by race, ethnicity, or income)",
  "Composition only (sample percentages, no group results)",
  "Group-specific effects reported",
  "Treatment-by-group interaction reported",
  "Group-by-arm cells reported (means or counts per group per arm)",
];
export const MEASURE_VALIDATION = ["Yes, for each group studied", "Partly", "No or not reported"];

export const OUTCOME_FAMILIES: Record<string, string> = {
  engagement: "Service engagement",
  mental_health: "Mental health or behavior",
  discipline: "Discipline or school behavior",
};

export const GROUP_DIMENSIONS: Record<string, string> = {
  black_white: "Black vs. White",
  latinx_white: "Latinx vs. White",
  income: "Lower-income vs. higher-income",
  other: "Other contrast (specify)",
};

export const TIERS: Record<string, string> = {
  cells: "Numbers for each group in each condition (most common)",
  subgroup: "A ready-made effect size for each group",
  interaction: "Only a treatment-by-group interaction",
};

// Default inclusion criteria for the AI pre-screen of titles and abstracts (step 1). The team can
// edit the saved copy on the search page; this is only the starting text.
export const DEFAULT_SCREEN_CRITERIA = `1. The study was done in the United States.
2. The program was delivered in or through a school, college, or university (kindergarten through college), not only in a clinic or community setting.
3. The program is about mental health, emotions, or behavior: counseling, therapy, social-emotional learning, mindfulness, behavior or discipline programs, or school mental health services. Purely academic or physical health programs do not count.
4. The program group was compared with a control or comparison group that did not get it (randomized trial, wait-list, matched comparison, quasi-experiment). One group measured before and after does not count.
5. Participants were students aged about 5 to 25.
6. At least one outcome is service use or engagement (for example sessions attended, referrals, help-seeking), mental health or behavior (for example depression, anxiety, behavior ratings), or discipline and attendance (for example suspensions, absences).
7. The paper reports its own new results (not a review, meta-analysis, commentary, or protocol).
Note: a paper is NOT excluded for lacking results by race, ethnicity, or income; samples with Black, Latinx, or lower-income students are of special interest but are not required at this stage.`;
