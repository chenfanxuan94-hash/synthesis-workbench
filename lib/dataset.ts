// Builds the analysis-ready rows (one per extracted effect) with paper and final coding joined.
import { db } from "./supabase";
import type { Coding, Effect, Member, Paper } from "./types";

export const COLUMNS: { key: string; label: string; def: string }[] = [
  { key: "effect_id", label: "effect_id", def: "Unique id of the effect row." },
  { key: "paper_id", label: "paper_id", def: "Unique id of the paper. Use as the clustering variable in three-level models." },
  { key: "study", label: "study", def: "First author and year, for labels." },
  { key: "title", label: "title", def: "Paper title." },
  { key: "year", label: "year", def: "Publication year." },
  { key: "doi", label: "doi", def: "DOI when known." },
  { key: "source", label: "source", def: "How the record entered the library (seed list, database search, upload, manual)." },
  { key: "study_design", label: "study_design", def: "RCT, cluster RCT, quasi-experiment, other (final coding)." },
  { key: "targeting_level", label: "targeting_level", def: "Universal, selective, indicated, or mixed/unclear. Moderator for Hypothesis 1." },
  { key: "cultural_adaptation", label: "cultural_adaptation", def: "Whether the program was described as culturally adapted. Moderator for Hypothesis 2." },
  { key: "adaptation_depth", label: "adaptation_depth", def: "Surface, deep, both, or not reported (Bernal dimensions)." },
  { key: "delivery_agent", label: "delivery_agent", def: "Clinician, teacher or school staff, peer, mixed, other. Moderator for Hypothesis 3." },
  { key: "dosage_sessions", label: "dosage_sessions", def: "Number of sessions." },
  { key: "dosage_weeks", label: "dosage_weeks", def: "Program duration in weeks." },
  { key: "risk_of_bias", label: "risk_of_bias", def: "Low, some concerns, high, not assessed." },
  { key: "setting", label: "setting", def: "Elementary, middle, high school, college, mixed." },
  { key: "age_min", label: "age_min", def: "Youngest participants." },
  { key: "age_max", label: "age_max", def: "Oldest participants." },
  { key: "n_total", label: "n_total", def: "Total analyzed sample." },
  { key: "pct_black", label: "pct_black", def: "Percent Black in the sample (composition fallback)." },
  { key: "pct_latinx", label: "pct_latinx", def: "Percent Latinx in the sample." },
  { key: "pct_low_income", label: "pct_low_income", def: "Percent lower-income (for example free or reduced-price lunch)." },
  { key: "single_group_sample", label: "single_group_sample", def: "TRUE when the sample contains one group only, so no within-study gap exists; such rows belong to the benchmarking analysis." },
  { key: "reporting_level", label: "reporting_level", def: "Audit variable: the most detailed group-specific reporting present in the paper." },
  { key: "measures_validated_by_group", label: "measures_validated_by_group", def: "Whether outcome measures have validation evidence for each group studied." },
  { key: "outcome_family", label: "outcome_family", def: "engagement (primary), mental_health, or discipline." },
  { key: "outcome_name", label: "outcome_name", def: "The specific measure." },
  { key: "outcome_type", label: "outcome_type", def: "continuous or binary." },
  { key: "higher_is_worse", label: "higher_is_worse", def: "TRUE when a higher score is a worse outcome (symptoms, suspensions). All effect sizes are already oriented so positive means improvement; this records the flip that was applied." },
  { key: "timepoint", label: "timepoint", def: "Post-test or follow-up, with months when given." },
  { key: "group_dimension", label: "group_dimension", def: "black_white, latinx_white, income, or other." },
  { key: "marginalized_group", label: "marginalized_group", def: "Label of the marginalized group (m)." },
  { key: "comparison_group", label: "comparison_group", def: "Label of the comparison group (c)." },
  { key: "tier", label: "tier", def: "cells (group-by-arm summary statistics), subgroup (reported effect per group), interaction (reported treatment-by-group term)." },
  { key: "m_t_n", label: "m_t_n", def: "Marginalized group, treatment arm, n." },
  { key: "m_t_mean", label: "m_t_mean", def: "Marginalized group, treatment arm, mean." },
  { key: "m_t_sd", label: "m_t_sd", def: "Marginalized group, treatment arm, SD." },
  { key: "m_t_events", label: "m_t_events", def: "Marginalized group, treatment arm, events (binary)." },
  { key: "m_c_n", label: "m_c_n", def: "Marginalized group, control arm, n." },
  { key: "m_c_mean", label: "m_c_mean", def: "Marginalized group, control arm, mean." },
  { key: "m_c_sd", label: "m_c_sd", def: "Marginalized group, control arm, SD." },
  { key: "m_c_events", label: "m_c_events", def: "Marginalized group, control arm, events." },
  { key: "c_t_n", label: "c_t_n", def: "Comparison group, treatment arm, n." },
  { key: "c_t_mean", label: "c_t_mean", def: "Comparison group, treatment arm, mean." },
  { key: "c_t_sd", label: "c_t_sd", def: "Comparison group, treatment arm, SD." },
  { key: "c_t_events", label: "c_t_events", def: "Comparison group, treatment arm, events." },
  { key: "c_c_n", label: "c_c_n", def: "Comparison group, control arm, n." },
  { key: "c_c_mean", label: "c_c_mean", def: "Comparison group, control arm, mean." },
  { key: "c_c_sd", label: "c_c_sd", def: "Comparison group, control arm, SD." },
  { key: "c_c_events", label: "c_c_events", def: "Comparison group, control arm, events." },
  { key: "sg_d_m", label: "sg_d_m", def: "Reported effect size for the marginalized group, as printed." },
  { key: "sg_se_m", label: "sg_se_m", def: "Its standard error." },
  { key: "sg_d_c", label: "sg_d_c", def: "Reported effect size for the comparison group, as printed." },
  { key: "sg_se_c", label: "sg_se_c", def: "Its standard error." },
  { key: "int_coef", label: "int_coef", def: "Reported treatment-by-group interaction coefficient, as printed." },
  { key: "int_se", label: "int_se", def: "Its standard error." },
  { key: "int_scale", label: "int_scale", def: "standardized or raw. Raw interaction rows are not on the SMD scale." },
  { key: "g_m", label: "g_m", def: "Program effect for the marginalized group, Hedges g, oriented so positive = improvement. Binary rows: log-odds-ratio converted to d." },
  { key: "var_m", label: "var_m", def: "Sampling variance of g_m." },
  { key: "g_c", label: "g_c", def: "Program effect for the comparison group, same scale." },
  { key: "var_c", label: "var_c", def: "Sampling variance of g_c." },
  { key: "delta", label: "delta", def: "Gap change = g_m - g_c. Positive means the gap narrowed. This is the primary effect size for pooling." },
  { key: "var_delta", label: "var_delta", def: "Sampling variance of delta = var_m + var_c (groups are disjoint samples)." },
  { key: "rd_delta", label: "rd_delta", def: "Binary only: difference in risk differences (absolute scale, in proportion units)." },
  { key: "var_rd_delta", label: "var_rd_delta", def: "Sampling variance of rd_delta." },
  { key: "lnrr_delta", label: "lnrr_delta", def: "Binary only: difference in log risk ratios (relative scale)." },
  { key: "var_lnrr_delta", label: "var_lnrr_delta", def: "Sampling variance of lnrr_delta." },
  { key: "compute_note", label: "compute_note", def: "Any adjustment applied during computation (continuity correction, single SD, raw scale)." },
  { key: "page", label: "page", def: "Page of the PDF the numbers came from." },
  { key: "source_label", label: "source_label", def: "Table or figure label in the paper." },
  { key: "quote", label: "quote", def: "Verbatim text the numbers were taken from." },
  { key: "entered_by", label: "entered_by", def: "Who extracted the row." },
  { key: "verified_by", label: "verified_by", def: "Who checked it against the paper. Blank means unverified." },
  { key: "notes", label: "notes", def: "Extractor notes." },
];

export type DatasetRow = Record<string, string | number | boolean | null>;

export async function buildDataset(opts: { verifiedOnly?: boolean } = {}): Promise<DatasetRow[]> {
  const d = db();
  const [{ data: effects }, { data: papers }, { data: codings }, { data: members }] = await Promise.all([
    d.from("effects").select("*").order("created_at"),
    d.from("papers").select("id,title,first_author,year,doi,source"),
    d.from("codings").select("*"),
    d.from("members").select("id,name,initials"),
  ]);
  const P = new Map(((papers || []) as Paper[]).map((p) => [p.id, p]));
  const M = new Map(((members || []) as Member[]).map((m) => [m.id, m.name]));
  const finalCoding = new Map<string, Coding>();
  for (const c of (codings || []) as Coding[]) {
    const cur = finalCoding.get(c.paper_id);
    if (!cur || (c.is_final && !cur.is_final)) finalCoding.set(c.paper_id, c);
  }
  const rows: DatasetRow[] = [];
  for (const e of (effects || []) as Effect[]) {
    if (opts.verifiedOnly && !e.verified_by) continue;
    const p = P.get(e.paper_id);
    const c = finalCoding.get(e.paper_id);
    const row: DatasetRow = {};
    for (const col of COLUMNS) {
      const k = col.key;
      if (k === "effect_id") row[k] = e.id;
      else if (k === "paper_id") row[k] = e.paper_id;
      else if (k === "study") row[k] = p ? `${p.first_author || "?"} ${p.year || ""}`.trim() : "";
      else if (k === "title") row[k] = p?.title ?? null;
      else if (k === "year") row[k] = p?.year ?? null;
      else if (k === "doi") row[k] = p?.doi ?? null;
      else if (k === "source") row[k] = p?.source ?? null;
      else if (k === "entered_by") row[k] = M.get(e.entered_by) ?? null;
      else if (k === "verified_by") row[k] = e.verified_by ? M.get(e.verified_by) ?? null : null;
      else if (k in e) row[k] = (e as any)[k] ?? null;
      else if (c && k in c) row[k] = (c as any)[k] ?? null;
      else row[k] = null;
    }
    rows.push(row);
  }
  return rows;
}

export function toCSV(rows: DatasetRow[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = COLUMNS.map((c) => c.label).join(",");
  const body = rows.map((r) => COLUMNS.map((c) => esc(r[c.key])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}
