// Builds the analysis-ready dataset: one row per extracted effect from the APPROVED papers
// (approved by votes, or by a recorded final decision), with the paper's shared coding attached.
import ExcelJS from "exceljs";
import { selectAll } from "./db";
import { standing } from "./status";
import { allMembers } from "./session";
import { DB_LABEL } from "./search/dbs";
import { buildBank } from "./keywords";
import { screenStanding } from "./screening";
import type { Coding, Effect, FoundBy, Member, Paper, Screen, SearchRun, Vote } from "./types";

export const COLUMNS: { key: string; label: string; def: string }[] = [
  { key: "effect_id", label: "effect_id", def: "Unique id of the effect row." },
  { key: "paper_id", label: "paper_id", def: "Unique id of the paper. Use as the clustering variable in three-level models." },
  { key: "study", label: "study", def: "First author and year, for labels." },
  { key: "title", label: "title", def: "Paper title." },
  { key: "year", label: "year", def: "Publication year." },
  { key: "doi", label: "doi", def: "DOI when known." },
  { key: "source", label: "source", def: "How the record entered the library (seed list, database search, upload, manual)." },
  { key: "approved_by", label: "approved_by", def: "votes (two Include votes, no Exclude) or decision (a final decision recorded by the team)." },
  { key: "coding_done", label: "coding_done", def: "TRUE when the team marked the paper done. Rows from unfinished papers are included but may still change." },
  { key: "coding_ai_assisted", label: "coding_ai_assisted", def: "TRUE when the AI filled the study-features form from the paper's text and a person checked it." },
  { key: "study_design", label: "study_design", def: "RCT, cluster RCT, quasi-experiment, other." },
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
  { key: "entered_by", label: "entered_by", def: "Who entered the row." },
  { key: "last_edited_by", label: "last_edited_by", def: "Who last saved the row." },
  { key: "ai_assisted", label: "ai_assisted", def: "TRUE when the AI drafted the row from a screenshot or the text and a person checked it before saving." },
  { key: "notes", label: "notes", def: "Extractor notes." },
];

export type DatasetRow = Record<string, string | number | boolean | null>;

export type PaperRow = Record<string, string | number | boolean | null>;

export type Dataset = {
  rows: DatasetRow[];
  papers: PaperRow[];           // one row per paper in the library, for the Papers sheet
  approvedPapers: number;
  approvedDone: number;
  papersWithRows: number;
  memberNames: string[];
  codingsOfApproved: Coding[];
  searches: SearchLogRow[];     // every database search run in step 1, for the PRISMA record
  bank: SearchLogRow[];         // the keyword bank: one row per distinct query with its yield
};

export type SearchLogRow = Record<string, string | number | null>;

export async function buildDataset(): Promise<Dataset> {
  const [P, V, C, E, S, members] = await Promise.all([
    selectAll<Paper>("papers", "id,title,authors,first_author,year,journal,doi,source,pdf_path,pi_decision,pi_note,pi_by,created_at,found_by,screened_in_at", { order: "created_at", eq: ["stage", "master"] }),
    selectAll<Vote>("votes", "id,paper_id,member_id,decision,reason,notes,updated_at", { order: "updated_at" }),
    selectAll<Coding>("codings", "*", { order: "updated_at" }),
    selectAll<Effect>("effects", "*", { order: "created_at" }),
    selectAll<SearchRun>("searches", "*", { order: "run_at" }),
    allMembers(),
  ]);
  // The search list, only as far as the keyword bank needs it: which query found each candidate and whether it was screened out.
  const [CS, K] = await Promise.all([
    selectAll<{ id: string; found_by: FoundBy[] | null; screen_decision: "in" | "out" | null }>("papers", "id,found_by,screen_decision", { order: "created_at", eq: ["stage", "search"] }),
    selectAll<Screen>("screens", "id,paper_id,member_id,decision,reason,updated_at", { order: "updated_at" }),
  ]);
  const marksBy = new Map<string, Screen[]>();
  for (const k of K.data) (marksBy.get(k.paper_id) || marksBy.set(k.paper_id, []).get(k.paper_id)!).push(k);
  const M = new Map(members.map((m) => [m.id, m.name]));
  const name = (id: string | null | undefined) => (id ? M.get(id) ?? null : null);
  const searches: SearchLogRow[] = [];
  for (const r of S.data) {
    for (const d of r.dbs || []) {
      const x = r.results?.[d];
      searches.push({ run_at: r.run_at, run_by: name(r.run_by), query: r.query, database: DB_LABEL[d] || d, year_from: r.year_from, year_to: r.year_to, limit_per_database: r.per_db, found: x?.found ?? null, pulled: x?.pulled ?? null, new_records: x?.added ?? null, already_known: x?.dup ?? null, error: x?.error ?? null });
    }
  }
  const votesBy = new Map<string, Vote[]>();
  for (const v of V.data) (votesBy.get(v.paper_id) || votesBy.set(v.paper_id, []).get(v.paper_id)!).push(v);
  const codingBy = new Map<string, Coding>();
  for (const c of C.data) {
    const cur = codingBy.get(c.paper_id);
    if (!cur || c.updated_at > cur.updated_at || (c.done && !cur.done)) codingBy.set(c.paper_id, c);
  }
  const effectsBy = new Map<string, Effect[]>();
  for (const e of E.data) (effectsBy.get(e.paper_id) || effectsBy.set(e.paper_id, []).get(e.paper_id)!).push(e);

  const rows: DatasetRow[] = [];
  const papers: PaperRow[] = [];
  let approvedPapers = 0, approvedDone = 0;
  const withRows = new Set<string>();
  const codingsOfApproved: Coding[] = [];

  for (const p of P.data) {
    const votes = votesBy.get(p.id) || [];
    const s = standing(p, votes);
    const c = codingBy.get(p.id);
    const effs = effectsBy.get(p.id) || [];
    const study = `${p.first_author || "?"} ${p.year || ""}`.trim();
    const pr: PaperRow = {
      paper_id: p.id, study, title: p.title, authors: p.authors, year: p.year, journal: p.journal, doi: p.doi, source: p.source,
      status: s.byPI ? (s.status === "approved" ? "approved by decision" : "rejected by decision") : s.status.replace("_", " "),
      include_votes: s.include, exclude_votes: s.exclude, unsure_votes: s.unsure,
    };
    for (const m of members) {
      const v = votes.find((x) => x.member_id === m.id);
      pr["vote_" + m.name] = v ? (v.decision === "unsure" ? "not sure" : v.decision) + (v.reason ? ` (${v.reason})` : "") : null;
    }
    pr.final_decision = p.pi_decision;
    pr.decision_note = p.pi_note;
    pr.decision_by = name(p.pi_by);
    pr.coding_done = c ? c.done : false;
    pr.coding_last_saved_by = c ? name(c.updated_by || c.coder_id) : null;
    pr.coding_ai_assisted = Boolean(c?.ai_assisted);
    pr.effect_rows = effs.length;
    pr.pdf = Boolean(p.pdf_path);
    const fb = Array.isArray(p.found_by) ? p.found_by : [];
    pr.found_by = fb.length ? Array.from(new Set(fb.map((f) => `${DB_LABEL[f.db] || f.db}: ${f.q}`))).join(" | ") : null;
    pr.screened_in_at = p.screened_in_at || null;
    papers.push(pr);

    if (s.status !== "approved") continue;
    approvedPapers++;
    if (c?.done) approvedDone++;
    if (c) codingsOfApproved.push(c);
    for (const e of effs) {
      withRows.add(p.id);
      const row: DatasetRow = {};
      for (const col of COLUMNS) {
        const k = col.key;
        if (k === "effect_id") row[k] = e.id;
        else if (k === "paper_id") row[k] = e.paper_id;
        else if (k === "study") row[k] = study;
        else if (k === "title") row[k] = p.title ?? null;
        else if (k === "year") row[k] = p.year ?? null;
        else if (k === "doi") row[k] = p.doi ?? null;
        else if (k === "source") row[k] = p.source ?? null;
        else if (k === "approved_by") row[k] = s.byPI ? "decision" : "votes";
        else if (k === "coding_done") row[k] = c ? c.done : false;
        else if (k === "coding_ai_assisted") row[k] = Boolean(c?.ai_assisted);
        else if (k === "entered_by") row[k] = name(e.entered_by);
        else if (k === "last_edited_by") row[k] = name(e.updated_by || e.entered_by);
        else if (k === "ai_assisted") row[k] = Boolean(e.ai_assisted);
        else if (k in e) row[k] = (e as any)[k] ?? null;
        else if (c && k in c) row[k] = (c as any)[k] ?? null;
        else row[k] = null;
      }
      rows.push(row);
    }
  }
  const bankRows = buildBank(S.data, [
    ...CS.data.map((c) => ({ found_by: c.found_by, stage: "search" as const, status: screenStanding(c, marksBy.get(c.id) || []).status })),
    ...P.data.map((p) => ({ found_by: p.found_by, stage: "master" as const })),
  ]).rows;
  const bank: SearchLogRow[] = bankRows.map((r) => ({
    query: r.query, runs: r.runs, databases: r.dbs.map((d) => DB_LABEL[d] || d).join(", "), last_run_at: r.lastAt, last_run_by: name(r.lastBy),
    found_latest_run: r.found, found_per_database: r.dbs.map((d) => `${DB_LABEL[d] || d}: ${r.perDb[d] ? (r.perDb[d].error ? "failed" : r.perDb[d].found) : "-"}`).join("; "), pulled: r.pulled, new_records: r.added, still_in_search_list: r.inList, screened_out: r.out, moved_to_master_list: r.moved, database_failures: r.errors,
  }));
  return { rows, papers, approvedPapers, approvedDone, papersWithRows: withRows.size, memberNames: members.map((m) => m.name), codingsOfApproved, searches, bank };
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

const PAPER_DEFS: Record<string, string> = {
  paper_id: "Unique id of the paper.", study: "First author and year.", title: "Paper title.", authors: "Authors as recorded.", year: "Publication year.",
  journal: "Journal.", doi: "DOI when known.", source: "How the record entered the library.",
  status: "needs votes, approved, rejected, split (needs a decision), approved by decision, or rejected by decision.",
  include_votes: "Number of Include votes.", exclude_votes: "Number of Exclude votes.", unsure_votes: "Number of Not sure votes.",
  final_decision: "include or exclude when the team recorded a final decision over the votes.", decision_note: "The note recorded with the decision.", decision_by: "Who recorded the decision.",
  coding_done: "TRUE when the paper was marked done.", coding_last_saved_by: "Who last saved the study features.", coding_ai_assisted: "TRUE when the AI filled the study-features form and a person checked it.",
  effect_rows: "Number of effect rows entered.", pdf: "TRUE when a PDF is attached.",
  found_by: "The database searches (step 1) that returned this record, as database: query. Empty for papers added by hand.",
  screened_in_at: "When the paper was moved from the search list to the master list at title-and-abstract screening. Empty for papers added straight to the master list.",
};

const SEARCH_DEFS: Record<string, string> = {
  run_at: "When the search was run.", run_by: "Who ran it.", query: "The query as typed.", database: "The database searched.",
  year_from: "Lower year limit, if set.", year_to: "Upper year limit, if set.", limit_per_database: "Maximum records pulled from each database.",
  found: "Records the database reported for the query.", pulled: "Records actually retrieved (found, capped at the limit).",
  new_records: "Records added to the search list by this run (not already in the library from an earlier search or by hand).",
  already_known: "Retrieved records already in the library.", error: "Set when the database failed to answer.",
};

const BANK_DEFS: Record<string, string> = {
  query: "The query, as last typed (case and spacing ignored when runs are grouped).", runs: "How many times it was run.", databases: "Every database it was sent to.",
  last_run_at: "When it was last run.", last_run_by: "Who ran it last.", found_latest_run: "Records the databases reported on the latest run, summed across databases (loose queries read as any-of-these-words produce millions here).",
  found_per_database: "The same, database by database, on the latest run.",
  pulled: "Records retrieved across all runs.", new_records: "Candidates it added to the search list across all runs.",
  still_in_search_list: "Its candidates still in the search list.", screened_out: "Of those, screened out at title and abstract.",
  moved_to_master_list: "Its candidates that moved to the master list: the yield of the query.", database_failures: "Database errors across runs.",
};

// Excel workbook: Effects (the analysis file), Papers (the master list with votes), Search log and Keyword bank (step 1), Codebook.
export async function toXLSX(ds: Dataset): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CHHSR Meta Analysis Portal";
  wb.created = new Date();

  const ws = wb.addWorksheet("Effects");
  ws.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: Math.min(40, Math.max(10, c.label.length + 2)) }));
  for (const r of ds.rows) ws.addRow(COLUMNS.map((c) => (r[c.key] === undefined ? null : r[c.key])));
  styleHeader(ws);

  const wp = wb.addWorksheet("Papers");
  const paperKeys = ds.papers.length ? Object.keys(ds.papers[0]) : Object.keys(PAPER_DEFS);
  wp.columns = paperKeys.map((k) => ({ header: k, key: k, width: k === "title" ? 60 : k === "authors" ? 40 : Math.min(30, Math.max(10, k.length + 2)) }));
  for (const r of ds.papers) wp.addRow(paperKeys.map((k) => (r[k] === undefined ? null : r[k])));
  styleHeader(wp);

  const wsl = wb.addWorksheet("Search log");
  const searchKeys = Object.keys(SEARCH_DEFS);
  wsl.columns = searchKeys.map((k) => ({ header: k, key: k, width: k === "query" ? 60 : Math.min(24, Math.max(10, k.length + 2)) }));
  for (const r of ds.searches) wsl.addRow(searchKeys.map((k) => (r[k] === undefined ? null : r[k])));
  styleHeader(wsl);

  const wkb = wb.addWorksheet("Keyword bank");
  const bankKeys = Object.keys(BANK_DEFS);
  wkb.columns = bankKeys.map((k) => ({ header: k, key: k, width: k === "query" ? 60 : Math.min(24, Math.max(10, k.length + 2)) }));
  for (const r of ds.bank) wkb.addRow(bankKeys.map((k) => (r[k] === undefined ? null : r[k])));
  styleHeader(wkb);

  const wc = wb.addWorksheet("Codebook");
  wc.columns = [{ header: "sheet", key: "sheet", width: 10 }, { header: "column", key: "column", width: 30 }, { header: "definition", key: "definition", width: 110 }];
  for (const c of COLUMNS) wc.addRow(["Effects", c.label, c.def]);
  for (const k of paperKeys) wc.addRow(["Papers", k, PAPER_DEFS[k] || (k.startsWith("vote_") ? `${k.slice(5)}'s vote, with the exclusion reason in brackets.` : "")]);
  for (const k of searchKeys) wc.addRow(["Search log", k, SEARCH_DEFS[k]]);
  for (const k of bankKeys) wc.addRow(["Keyword bank", k, BANK_DEFS[k]]);
  styleHeader(wc);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF9EFF1" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  if (ws.columnCount > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}
