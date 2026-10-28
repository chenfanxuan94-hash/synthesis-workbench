export type Member = { id: string; name: string; initials: string; is_pi?: boolean };

// Where a search hit was found: one entry per database search that returned it.
export type FoundBy = { q: string; db: string; at: string; id?: string | null };

// What the AI thought of a candidate at title-and-abstract screening (a hint, never a decision).
export type AiScreen = { verdict: "likely" | "unlikely" | "unclear"; reason: string; at: string; model?: string };

export type Paper = {
  id: string;
  title: string | null;
  authors: string | null;
  first_author: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  abstract: string | null;
  source: string | null;
  pdf_path: string | null;
  pages: string[] | null;
  pi_decision: "include" | "exclude" | null;
  pi_note: string | null;
  pi_by: string | null;
  pi_at: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
  // Step 1 (search and screen). "search" = a candidate waiting to be screened; "master" = in the master list.
  stage?: "search" | "master";
  found_by?: FoundBy[] | null;
  keywords?: string[] | null;
  pmid?: string | null;
  external_ids?: Record<string, string> | null;
  cited_by?: number | null;
  screen_decision?: "in" | "out" | null;
  screen_by?: string | null;
  screen_at?: string | null;
  screened_in_at?: string | null;
  ai_screen?: AiScreen | null;
};

// One person's title-and-abstract screening mark on a candidate.
export type ScreenMark = "relevant" | "not_relevant" | "unsure";

export type Screen = {
  id: string;
  paper_id: string;
  member_id: string;
  decision: ScreenMark;
  reason: string | null;
  updated_at: string;
};

export type ScreenStatus = "pending" | "in" | "out" | "split";

export type ScreenStanding = {
  status: ScreenStatus;
  byDecision: boolean;    // a recorded decision, not the marks, decides
  relevant: number;
  not_relevant: number;
  unsure: number;
};

// One database search that was run, kept for the PRISMA record.
export type SearchRun = {
  id: string;
  query: string;
  dbs: string[];
  year_from: number | null;
  year_to: number | null;
  per_db: number | null;
  run_by: string | null;
  run_at: string;
  results: Record<string, { found: number; pulled: number; added: number; dup: number; error: string | null }> | null;
  pulled: number;
  added: number;
};

export type Decision = "include" | "exclude" | "unsure";

export type Vote = {
  id: string;
  paper_id: string;
  member_id: string;
  decision: Decision;
  reason: string | null;
  notes: string | null;
  updated_at: string;
};

export type Coding = {
  id: string;
  paper_id: string;
  coder_id: string;
  updated_by: string | null;
  done: boolean;
  study_design: string | null;
  targeting_level: string | null;
  cultural_adaptation: string | null;
  adaptation_depth: string | null;
  delivery_agent: string | null;
  dosage_sessions: number | null;
  dosage_weeks: number | null;
  risk_of_bias: string | null;
  setting: string | null;
  age_min: number | null;
  age_max: number | null;
  n_total: number | null;
  pct_black: number | null;
  pct_latinx: number | null;
  pct_low_income: number | null;
  single_group_sample: boolean | null;
  reporting_level: string | null;
  measures_validated_by_group: string | null;
  notes: string | null;
  evidence?: Record<string, { quote: string; page: number | null }> | null;
  ai_assisted?: boolean;
  created_at: string;
  updated_at: string;
};

export type Effect = {
  id: string;
  paper_id: string;
  entered_by: string;
  updated_by: string | null;
  ai_assisted: boolean;
  outcome_family: "engagement" | "mental_health" | "discipline";
  outcome_name: string | null;
  outcome_type: "continuous" | "binary";
  higher_is_worse: boolean;
  timepoint: string | null;
  group_dimension: "black_white" | "latinx_white" | "income" | "other";
  marginalized_group: string | null;
  comparison_group: string | null;
  tier: "cells" | "subgroup" | "interaction";
  m_t_n: number | null; m_t_mean: number | null; m_t_sd: number | null; m_t_events: number | null;
  m_c_n: number | null; m_c_mean: number | null; m_c_sd: number | null; m_c_events: number | null;
  c_t_n: number | null; c_t_mean: number | null; c_t_sd: number | null; c_t_events: number | null;
  c_c_n: number | null; c_c_mean: number | null; c_c_sd: number | null; c_c_events: number | null;
  sg_d_m: number | null; sg_se_m: number | null; sg_d_c: number | null; sg_se_c: number | null;
  int_coef: number | null; int_se: number | null; int_scale: string | null;
  g_m: number | null; var_m: number | null; g_c: number | null; var_c: number | null;
  delta: number | null; var_delta: number | null;
  rd_delta: number | null; var_rd_delta: number | null;
  lnrr_delta: number | null; var_lnrr_delta: number | null;
  compute_note: string | null;
  page: number | null;
  source_label: string | null;
  quote: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  paper_id: string | null;
  member_id: string | null;
  action: string;
  detail: string | null;
  created_at: string;
};

// Where a paper stands, worked out from the votes and any recorded final decision.
export type PaperStatus = "needs_votes" | "approved" | "rejected" | "split";

export type Standing = {
  status: PaperStatus;
  byPI: boolean;          // the status comes from a recorded final decision, not the votes
  include: number;        // votes cast each way
  exclude: number;
  unsure: number;
};
