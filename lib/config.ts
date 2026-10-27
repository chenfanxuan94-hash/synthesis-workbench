// Project-wide vocabularies. Edit here; the forms and the codebook read from this file.

export const SCREENERS_REQUIRED = 2;

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
  cells: "Group-by-arm cells (means, SDs, Ns or events)",
  subgroup: "Reported effect size per group",
  interaction: "Reported treatment-by-group interaction",
};
