// AI-drafted effect rows. The model reads a screenshot of a results table, or pages of
// the paper's extracted text, and proposes rows for the Effect sizes form. It only transcribes:
// every number it returns is printed in the paper, and a person checks each row before saving.
import { db } from "./supabase";
import { callClaudeTool, aiConfigured, type ClaudeBlock } from "./claude";
import { OUTCOME_FAMILIES, GROUP_DIMENSIONS } from "./config";
import { CODING_FIELDS, CODING_KEYS, type EvidenceMap } from "./codingFields";

export type DraftInput = {
  image?: { data: string; media: string } | null;   // base64 without the data: prefix
  pages?: { from: number; to: number } | null;       // 1-based, inclusive, from the paper's text
  hint?: string;
};

export type Candidate = {
  outcome_name: string;
  outcome_family: "engagement" | "mental_health" | "discipline";
  outcome_type: "continuous" | "binary";
  higher_is_worse: boolean;
  timepoint: string;
  group_dimension: "black_white" | "latinx_white" | "income" | "other";
  marginalized_group: string;
  comparison_group: string;
  tier: "cells" | "subgroup" | "interaction";
  m_t_n: number | null; m_t_mean: number | null; m_t_sd: number | null; m_t_events: number | null;
  m_c_n: number | null; m_c_mean: number | null; m_c_sd: number | null; m_c_events: number | null;
  c_t_n: number | null; c_t_mean: number | null; c_t_sd: number | null; c_t_events: number | null;
  c_c_n: number | null; c_c_mean: number | null; c_c_sd: number | null; c_c_events: number | null;
  sg_d_m: number | null; sg_se_m: number | null; sg_d_c: number | null; sg_se_c: number | null;
  int_coef: number | null; int_se: number | null; int_scale: "raw" | "standardized";
  page: number | null;
  source_label: string;
  quote: string;
  confidence: "high" | "medium" | "low";
  caution: string;
};

export type DraftResult =
  | { ok: true; candidates: Candidate[]; summary: string; model: string; source: string }
  | { ok: false; error: string };

export const NUMERIC_KEYS = [
  "m_t_n", "m_t_mean", "m_t_sd", "m_t_events", "m_c_n", "m_c_mean", "m_c_sd", "m_c_events",
  "c_t_n", "c_t_mean", "c_t_sd", "c_t_events", "c_c_n", "c_c_mean", "c_c_sd", "c_c_events",
  "sg_d_m", "sg_se_m", "sg_d_c", "sg_se_c", "int_coef", "int_se",
] as const;

const SYSTEM = `You help a research team extract numbers from published studies for a meta-analysis of school-based mental health and behavior programs in the United States. The team measures whether a program narrowed the gap between a marginalized group (Black students, Latinx students, or lower-income students) and a comparison group (White students or higher-income students).

Your job: read the supplied table image and/or page text and report every result that is broken down BOTH by group (race, ethnicity, or income) AND by study condition (program/treatment versus control), as candidate rows for a data entry form.

Rules:
1. Transcribe numbers exactly as printed. Never compute, convert, round, pool, or infer a number. If a number is not printed, leave it null.
2. One candidate per outcome measure x group contrast x time point. Black vs White and Latinx vs White in the same table are two candidates. Post-test and follow-up are two candidates.
3. tier = "cells" when the paper gives, for each group, a mean with SD and n (or a count of events out of n) for both the treatment arm and the control arm. tier = "subgroup" when it gives a ready-made standardized effect size (d, g, or a coefficient in SD units) with its standard error for each group separately. tier = "interaction" when it gives only a treatment-by-group interaction coefficient with its standard error.
4. m_ fields are the marginalized group, c_ fields the comparison group. _t_ is the treatment or program arm, _c_ is the control arm. m_t_mean is therefore the mean for the marginalized group in the program arm.
5. Standard errors only: if the paper prints a 95% confidence interval, a t statistic, or a p value instead of an SE, leave the SE null and say what was printed in caution.
6. If both unadjusted (descriptive) and adjusted (model-based) means are printed, prefer the unadjusted means and mention the adjusted ones in caution. If only adjusted means are printed, use them and write "adjusted means" in caution.
7. higher_is_worse is true for symptoms, problem behavior, suspensions, referrals, absences, dropout; false for attendance, sessions attended, service use, well-being, grades, prosocial behavior.
8. outcome_family: "engagement" for starting, attending, staying in, or completing services; "mental_health" for symptom, behavior, or functioning scores; "discipline" for suspensions, office referrals, attendance, or school discipline.
9. group_dimension: "black_white", "latinx_white", "income", or "other". Hispanic counts as Latinx; African American counts as Black; free or reduced-price lunch counts as lower-income.
10. For the quote, copy the exact table row, cell labels, or sentence the numbers came from. Give the page number when it is known (page text is labeled with its page number; for a screenshot, use the page number only if it is visible in the image, otherwise null). source_label is the table or figure name, for example "Table 3".
11. If nothing is broken down by group and condition, return an empty candidates list and explain in summary what the material does contain.
12. Report at most 25 candidates in one answer; if the material holds more, say so in summary so the person can ask again for the rest.
13. confidence: "high" when every number was clearly legible and the table structure was unambiguous; "medium" when a label or column had to be interpreted; "low" when groups, arms, or columns were unclear. Explain any interpretation in caution.

Never invent a result to be helpful. An empty list is a correct answer when the paper does not report results by group and condition.`;

const numberOrNull = { type: ["number", "null"] };
const TOOL = {
  name: "report_candidates",
  description: "Report the candidate effect rows found in the material, one per outcome x group contrast x time point.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Two or three sentences: what the material contains, what was extracted, and anything the person must check." },
      candidates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            outcome_name: { type: "string", description: "The measure as the paper names it, for example 'sessions attended' or 'CDI depression score'." },
            outcome_family: { type: "string", enum: Object.keys(OUTCOME_FAMILIES) },
            outcome_type: { type: "string", enum: ["continuous", "binary"], description: "continuous = means and SDs; binary = counts of students with the event out of n." },
            higher_is_worse: { type: "boolean" },
            timepoint: { type: "string", description: "'post-test', or 'follow-up 6 mo', and so on." },
            group_dimension: { type: "string", enum: Object.keys(GROUP_DIMENSIONS) },
            marginalized_group: { type: "string" },
            comparison_group: { type: "string" },
            tier: { type: "string", enum: ["cells", "subgroup", "interaction"] },
            m_t_n: numberOrNull, m_t_mean: numberOrNull, m_t_sd: numberOrNull, m_t_events: numberOrNull,
            m_c_n: numberOrNull, m_c_mean: numberOrNull, m_c_sd: numberOrNull, m_c_events: numberOrNull,
            c_t_n: numberOrNull, c_t_mean: numberOrNull, c_t_sd: numberOrNull, c_t_events: numberOrNull,
            c_c_n: numberOrNull, c_c_mean: numberOrNull, c_c_sd: numberOrNull, c_c_events: numberOrNull,
            sg_d_m: numberOrNull, sg_se_m: numberOrNull, sg_d_c: numberOrNull, sg_se_c: numberOrNull,
            int_coef: numberOrNull, int_se: numberOrNull,
            int_scale: { type: "string", enum: ["raw", "standardized"] },
            page: { type: ["integer", "null"] },
            source_label: { type: "string" },
            quote: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            caution: { type: "string", description: "Anything the person must check or decide. Empty when nothing needs saying." },
          },
          required: ["outcome_name", "outcome_family", "outcome_type", "higher_is_worse", "timepoint", "group_dimension", "marginalized_group", "comparison_group", "tier", "quote", "confidence", "caution"],
        },
      },
    },
    required: ["summary", "candidates"],
  },
};

const MAX_TEXT = 70_000; // characters of page text sent in one request

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

// Makes sure every candidate has every field in the right type, whatever the model sent.
export function normalizeCandidate(raw: any): Candidate {
  const c: any = {
    outcome_name: String(raw?.outcome_name || "").slice(0, 200),
    outcome_family: oneOf(raw?.outcome_family, ["engagement", "mental_health", "discipline"] as const, "mental_health"),
    outcome_type: oneOf(raw?.outcome_type, ["continuous", "binary"] as const, "continuous"),
    higher_is_worse: raw?.higher_is_worse === true,
    timepoint: String(raw?.timepoint || "post-test").slice(0, 80),
    group_dimension: oneOf(raw?.group_dimension, ["black_white", "latinx_white", "income", "other"] as const, "other"),
    marginalized_group: String(raw?.marginalized_group || "").slice(0, 80),
    comparison_group: String(raw?.comparison_group || "").slice(0, 80),
    tier: oneOf(raw?.tier, ["cells", "subgroup", "interaction"] as const, "cells"),
    int_scale: oneOf(raw?.int_scale, ["raw", "standardized"] as const, "raw"),
    page: num(raw?.page) === null ? null : Math.round(num(raw?.page)!),
    source_label: String(raw?.source_label || "").slice(0, 80),
    quote: String(raw?.quote || "").slice(0, 2000),
    confidence: oneOf(raw?.confidence, ["high", "medium", "low"] as const, "low"),
    caution: String(raw?.caution || "").slice(0, 600),
  };
  for (const k of NUMERIC_KEYS) c[k] = num(raw?.[k]);
  return c as Candidate;
}

export async function draftFromPaper(paperId: string, input: DraftInput): Promise<DraftResult> {
  if (!aiConfigured()) return { ok: false, error: "AI drafts are not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings." };
  if (!input.image && !input.pages) return { ok: false, error: "Add a screenshot of the results table, or choose pages of the paper's text." };

  const { data: paper } = await db().from("papers").select("title,first_author,year,pages").eq("id", paperId).maybeSingle();
  if (!paper) return { ok: false, error: "Paper not found." };

  const blocks: ClaudeBlock[] = [];
  let source = "";
  const lines: string[] = [];
  lines.push(`Paper: ${paper.title || "(untitled)"}${paper.first_author ? ` (${paper.first_author}${paper.year ? ` ${paper.year}` : ""})` : ""}.`);
  if (input.hint?.trim()) lines.push(`Note from the person: ${input.hint.trim().slice(0, 500)}`);

  if (input.image) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(input.image.media)) return { ok: false, error: "The screenshot must be a PNG, JPEG, WebP, or GIF image." };
    if (input.image.data.length > 5_500_000) return { ok: false, error: "That screenshot is too large. Crop it to the table and try again." };
    blocks.push({ type: "image", source: { type: "base64", media_type: input.image.media, data: input.image.data } });
    lines.push("The image is a screenshot of a results table or figure from this paper. Read every number from the image.");
    source = "screenshot";
  }
  if (input.pages) {
    const pages: string[] = Array.isArray(paper.pages) ? paper.pages : [];
    if (pages.length === 0) return { ok: false, error: "This paper has no readable text (probably a scanned PDF). Use a screenshot instead." };
    const from = Math.max(1, Math.min(pages.length, Math.floor(input.pages.from || 1)));
    const to = Math.max(from, Math.min(pages.length, Math.floor(input.pages.to || pages.length)));
    let text = "";
    let cut = false;
    for (let i = from; i <= to; i++) {
      const chunk = `\n--- Page ${i} ---\n${pages[i - 1] || ""}\n`;
      if (text.length + chunk.length > MAX_TEXT) { cut = true; break; }
      text += chunk;
    }
    lines.push(`Below is the text of pages ${from} to ${to} of the paper as extracted from the PDF. Table layouts may have been flattened into lines; use the column headers and row labels to rebuild them.${cut ? " Not every requested page fit; later pages were left out." : ""}`);
    lines.push(text);
    source = source ? "screenshot and pages " + from + "-" + to : "pages " + from + "-" + to;
  }
  blocks.push({ type: "text", text: lines.join("\n\n") });

  const r = await callClaudeTool<{ summary?: string; candidates?: any[] }>({ system: SYSTEM, blocks, tool: TOOL, maxTokens: 8000 });
  if (!r.ok) return r;
  const cut = r.truncated ? " The answer was cut off, so some rows may be missing; ask again with a hint naming the rest." : "";
  let list: any = parseMaybe((r.input as any)?.candidates);
  if (!Array.isArray(list)) {
    const arr = Object.values(r.input || {}).map(parseMaybe).find((v) => Array.isArray(v) && v.some((x) => x && typeof x === "object"));
    list = Array.isArray(arr) ? arr : [];
  }
  const candidates = (list as any[]).slice(0, 40).map((c) => normalizeCandidate(parseMaybe(c)));
  const summary = (String((r.input as any)?.summary || (candidates.length ? "" : "Nothing broken down by group and condition was found.")) + cut).slice(0, 1500);
  return { ok: true, candidates, summary, model: r.model, source };
}


// ---------------------------------------------------------------------------------------------
// Study features: the AI reads the paper's text and proposes a value and a supporting sentence
// for each field of the coding form. The person checks each field before saving.

export type CodingDraftField = { value: string | number | boolean | null; quote: string; page: number | null };
export type CodingDraft = { fields: Record<string, CodingDraftField>; evidence: EvidenceMap; summary: string; model: string; pagesRead: number };
export type CodingDraftResult = { ok: true } & CodingDraft | { ok: false; error: string };

const CODING_SYSTEM = `You help a research team record the design features of published studies for a meta-analysis of school-based mental health and behavior programs in the United States. You will read the extracted text of one paper, page by page, and fill in a fixed form.

Rules:
1. Fill a field only from what the paper states. If the paper does not say, leave value null. Never guess from the title or from typical practice.
2. For each filled field, put in <field>_quote the exact words the value comes from, copied verbatim (at most about 30 words), and in <field>_page the page number from the "--- Page N ---" labels. A value without a quote is not acceptable.
3. Choice fields must use one of the listed options exactly. Number fields are plain numbers (percent as 0 to 100, no % sign). Yes-or-no fields are true or false.
4. Leave risk_of_bias at "Not assessed" unless randomization, attrition, and baseline equivalence are all described.
5. Do not fill adaptation_depth unless cultural_adaptation is Yes.
6. For reporting_level, search the whole Results section and every table for results broken down by race, ethnicity, or income, and choose the most detailed level present.
7. In summary, at most two short sentences: what the study is and what the person should double-check. Do not explain your reasoning there.`;

// Flat schema: for each field three top-level properties (value, quote, page). Nested objects
// sometimes come back from the model as JSON strings; a flat form avoids that. Summary goes last
// so a cut-off answer loses the summary, not the fields.
function codingTool() {
  const props: Record<string, unknown> = {};
  for (const k of CODING_KEYS) {
    const f = CODING_FIELDS[k];
    props[k] = f.type === "select" ? { type: ["string", "null"], enum: [...(f.options || []), null], description: `${f.label}. ${f.help} ${f.ai}` }
      : f.type === "number" ? { type: ["number", "null"], description: `${f.label}. ${f.help} ${f.ai}` }
      : { type: ["boolean", "null"], description: `${f.label}. ${f.help} ${f.ai}` };
    props[k + "_quote"] = { type: "string", description: `Verbatim sentence or table cell (at most about 30 words) that supports ${k}. Empty when ${k} is null.` };
    props[k + "_page"] = { type: ["integer", "null"], description: `Page number of that quote, from the --- Page N --- labels.` };
  }
  props.summary = { type: "string", description: "Two short sentences at most: what the study is, and anything the person must double-check." };
  return {
    name: "report_coding",
    description: "Report the value, supporting quote, and page for every field of the study-features form.",
    input_schema: { type: "object", properties: props, required: [...CODING_KEYS, "summary"] },
  };
}

function normalizeField(k: string, raw: any): CodingDraftField {
  const f = CODING_FIELDS[k];
  let value: CodingDraftField["value"] = null;
  const v = raw?.value;
  if (v !== null && v !== undefined && v !== "") {
    if (f.type === "select") {
      const opts = f.options || [];
      const t = String(v).trim().toLowerCase();
      const hit = opts.find((o) => o.toLowerCase() === t)
        || opts.find((o) => o.toLowerCase().startsWith(t) && t.length >= 2)
        || opts.find((o) => t.length >= 12 && o.toLowerCase().startsWith(t.slice(0, 12)));
      value = hit || null;
    } else if (f.type === "number") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[%,\s]/g, ""));
      value = Number.isFinite(n) ? n : null;
    } else {
      const t = String(v).trim().toLowerCase();
      value = v === true || t === "true" || t === "yes" ? true : v === false || t === "false" || t === "no" ? false : null;
    }
  }
  const quote = String(raw?.quote || "").slice(0, 600);
  const page = num(raw?.page) === null ? null : Math.round(num(raw?.page)!);
  return { value, quote, page };
}

function parseMaybe(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (t.startsWith("{") || t.startsWith("[")) { try { return JSON.parse(t); } catch { /* not JSON */ } }
  return v;
}

function firstOf(o: Record<string, any>, names: string[]): unknown {
  for (const n of names) if (o[n] !== undefined) return o[n];
  return undefined;
}

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

// Finds the answer for one field in whatever shape the model used: flat (study_design plus
// study_design_quote), nested ({value, quote, page}), a JSON string of either, wrapped in a
// "fields" or "form" object, an array of {field, value, quote}, or keyed by the field's label.
export function readCodingAnswer(rawInput: unknown): { fields: Record<string, CodingDraftField>; summary: string; shape: string } {
  let input = parseMaybe(rawInput) as any;
  if (!input || typeof input !== "object") input = {};
  const top = input as Record<string, any>;
  const pools: Record<string, any>[] = [top];
  for (const w of ["fields", "form", "coding", "values", "answers", "result", "data", "study_features"]) {
    const inner = parseMaybe(top[w]);
    if (Array.isArray(inner)) {
      const obj: Record<string, any> = {};
      for (const it of inner) {
        const item = parseMaybe(it) as any;
        const key = item && typeof item === "object" ? firstOf(item, ["field", "key", "name", "id"]) : undefined;
        if (typeof key === "string") obj[key] = item;
      }
      pools.push(obj);
    } else if (inner && typeof inner === "object") pools.push(inner as Record<string, any>);
  }
  const lookup = (k: string): { raw: unknown; quote: unknown; page: unknown } | null => {
    const label = norm(CODING_FIELDS[k].label);
    for (const pool of pools) {
      const keys = Object.keys(pool);
      const hit = keys.find((x) => x === k) ?? keys.find((x) => norm(x) === norm(k)) ?? keys.find((x) => norm(x) === label);
      if (hit !== undefined) {
        const qk = keys.find((x) => norm(x) === norm(k + "_quote") || norm(x) === norm(k + "_evidence"));
        const pk = keys.find((x) => norm(x) === norm(k + "_page"));
        return { raw: pool[hit], quote: qk ? pool[qk] : undefined, page: pk ? pool[pk] : undefined };
      }
    }
    return null;
  };
  const fields: Record<string, CodingDraftField> = {};
  for (const k of CODING_KEYS) {
    const found = lookup(k);
    if (!found) { fields[k] = { value: null, quote: "", page: null }; continue; }
    let raw = parseMaybe(found.raw) as any;
    let quote: unknown = found.quote;
    let page: unknown = found.page;
    if (Array.isArray(raw)) raw = parseMaybe(raw[0]);
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, any>;
      const q = firstOf(o, ["quote", "evidence", "source", "text", "excerpt", "support", "supporting_quote"]);
      if (quote === undefined) quote = q && typeof q === "object" ? firstOf(q as any, ["quote", "text"]) : q;
      if (page === undefined) page = firstOf(o, ["page", "page_number", "pageNumber", "pg"]);
      raw = firstOf(o, ["value", "answer", "val", "selected", "option", "choice", "result"]);
    }
    fields[k] = normalizeField(k, { value: raw, quote: typeof quote === "string" ? quote : "", page });
  }
  const sumRaw = firstOf(top, ["summary", "notes", "comment"]);
  const shape = `keys: ${Object.keys(top).slice(0, 12).join(", ")}${Object.keys(top).length > 12 ? ", ..." : ""}`;
  return { fields, summary: typeof sumRaw === "string" ? sumRaw : "", shape };
}

export async function draftCodingFromPaper(paperId: string): Promise<CodingDraftResult> {
  if (!aiConfigured()) return { ok: false, error: "AI drafts are not set up yet. Add ANTHROPIC_API_KEY in the Vercel project settings." };
  const { data: paper } = await db().from("papers").select("title,first_author,year,abstract,pages").eq("id", paperId).maybeSingle();
  if (!paper) return { ok: false, error: "Paper not found." };
  const pages: string[] = Array.isArray(paper.pages) ? paper.pages : [];
  if (pages.length === 0) return { ok: false, error: "This paper has no readable text (no PDF, or a scanned one), so the AI cannot read it. Fill the form by hand." };

  let text = "";
  let pagesRead = 0;
  for (let i = 0; i < pages.length; i++) {
    const chunk = `\n--- Page ${i + 1} ---\n${pages[i]}\n`;
    if (text.length + chunk.length > MAX_TEXT) break;
    text += chunk;
    pagesRead++;
  }
  const lines = [
    `Paper: ${paper.title || "(untitled)"}${paper.first_author ? ` (${paper.first_author}${paper.year ? ` ${paper.year}` : ""})` : ""}.`,
    pagesRead < pages.length ? `Only the first ${pagesRead} of ${pages.length} pages fit; later pages were left out.` : `All ${pages.length} pages follow.`,
    text,
  ];
  const r = await callClaudeTool<Record<string, any>>({ system: CODING_SYSTEM, blocks: [{ type: "text", text: lines.join("\n\n") }], tool: codingTool(), maxTokens: 8000 });
  if (!r.ok) return r;
  const parsed = readCodingAnswer(r.input);
  const evidence: EvidenceMap = {};
  let filled = 0;
  for (const k of CODING_KEYS) {
    const f = parsed.fields[k];
    if (f.value !== null) filled++;
    if (f.value !== null && f.quote) evidence[k] = { quote: f.quote, page: f.page };
  }
  if (filled === 0) {
    console.log("coding draft: nothing usable", parsed.shape, "stop:", r.stop);
    return {
      ok: false,
      error: r.truncated
        ? "The AI's answer was cut off before it reached the form fields. Try again; if it keeps happening, tell the person who maintains the app."
        : `The AI answered, but nothing in its answer matched the form fields, so nothing was filled. Try again once. If it happens again, send this line to whoever maintains the app: ${parsed.shape}; stop: ${r.stop || "none"}.`,
    };
  }
  const note = r.truncated ? " The answer was cut off, so some fields may be missing; run it again to try for the rest." : "";
  return { ok: true, fields: parsed.fields, evidence, summary: (parsed.summary + note).slice(0, 1200), model: r.model, pagesRead };
}
