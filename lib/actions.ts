"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, PDF_BUCKET } from "./supabase";
import { COOKIE, requireMember } from "./session";
import { computeEffect } from "./effects";
import { lookupDOI } from "./crossref";
import { cleanDOI, extractDOI, firstAuthor, initialsFor, type ParsedPaper } from "./parsers";
import { draftFromPaper, draftCodingFromPaper, prescreenCandidates, type DraftInput, type DraftResult, type CodingDraftResult, type ScreenItem } from "./ai";
import { CODING_KEYS, type EvidenceMap } from "./codingFields";
import { DEFAULT_SCREEN_CRITERIA } from "./config";
import { screenStanding, titleKey } from "./screening";
import { runSearch, type RunSummary, MAX_PER_DB } from "./search/run";
import { isDb, type Db } from "./search/dbs";
import type { KeywordIdea } from "./keywords";
import type { Decision, Screen, ScreenMark } from "./types";

export type Stage = "search" | "master";

// Every action that changes data returns one of these instead of throwing, because
// Next.js replaces thrown error messages with a generic one in production.
export type Result = { ok: true } | { ok: false; error: string };

// ---------- change log ----------

async function log(paperId: string | null, memberId: string, action: string, detail?: string | null) {
  const { error } = await db().from("activity").insert({ paper_id: paperId, member_id: memberId, action, detail: detail || null });
  if (error) console.error("activity log failed", action, error.message);
}

function refreshPaper(paperId: string) {
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/papers");
  revalidatePath("/search");
  revalidatePath("/dataset");
  revalidatePath("/");
}

// ---------- login ----------

export async function login(formData: FormData) {
  const memberId = String(formData.get("member") || "");
  const code = String(formData.get("code") || "");
  if (process.env.TEAM_CODE && code !== process.env.TEAM_CODE) {
    redirect("/login?error=code");
  }
  const { data } = await db().from("members").select("id").eq("id", memberId).maybeSingle();
  if (!data) redirect("/login?error=member");
  const jar = await cookies();
  jar.set(COOKIE, memberId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(COOKIE);
  redirect("/login");
}

// Remembers (per person, per browser) that the guide has been read, so Home stops pointing at it.
export async function markGuideRead() {
  const me = await requireMember();
  const jar = await cookies();
  jar.set("wb_guide_" + me.id, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 * 3 });
  redirect("/");
}

export async function addMember(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await db().from("members").insert({ name, initials: initialsFor(name) });
  revalidatePath("/login");
}

// ---------- papers ----------

async function findDuplicate(doi: string, title: string): Promise<string | null> {
  const d = db();
  if (doi) {
    const { data } = await d.from("papers").select("id").ilike("doi", doi).maybeSingle();
    if (data) return data.id;
  }
  if (title) {
    const key = titleKey(title);
    if (key.length >= 12) {
      const { data } = await d.from("papers").select("id").eq("title_key", key).limit(1);
      if (data && data[0]) return data[0].id;
    }
    const { data } = await d.from("papers").select("id").ilike("title", title.trim()).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// Adds one paper. stage "master" puts it straight in the master list (the default, for papers you
// already know); "search" puts it in the search list to be screened with the database hits.
export async function createPaper(p: ParsedPaper & { source?: string }, stage: Stage = "master"): Promise<{ id: string; duplicate: boolean }> {
  const me = await requireMember();
  const doi = cleanDOI(p.doi);
  const dup = await findDuplicate(doi, p.title);
  if (dup) return { id: dup, duplicate: true };
  const source = (p.source || "").trim() || "manual";
  const { data, error } = await db()
    .from("papers")
    .insert({
      title: p.title || null,
      authors: p.authors || null,
      first_author: firstAuthor(p.authors) || null,
      year: p.year,
      journal: p.journal || null,
      doi: doi || null,
      abstract: p.abstract || null,
      source,
      added_by: me.id,
      stage: stage === "search" ? "search" : "master",
      title_key: titleKey(p.title) || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await log(data.id, me.id, "added", source + (stage === "search" ? ", to the search list" : ""));
  revalidatePath("/papers");
  revalidatePath("/search");
  revalidatePath("/");
  return { id: data.id, duplicate: false };
}

export async function importPapers(list: ParsedPaper[], source: string, stage: Stage = "master"): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;
  for (const p of list) {
    const r = await createPaper({ ...p, source }, stage);
    if (r.duplicate) skipped++; else added++;
  }
  return { added, skipped };
}

export async function updatePaper(id: string, fields: Partial<ParsedPaper> & { source?: string }): Promise<Result> {
  const me = await requireMember();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) { patch.title = fields.title || null; patch.title_key = titleKey(fields.title) || null; }
  if (fields.authors !== undefined) { patch.authors = fields.authors || null; patch.first_author = firstAuthor(fields.authors) || null; }
  if (fields.year !== undefined) patch.year = fields.year;
  if (fields.journal !== undefined) patch.journal = fields.journal || null;
  if (fields.doi !== undefined) patch.doi = cleanDOI(fields.doi) || null;
  if (fields.abstract !== undefined) patch.abstract = fields.abstract || null;
  if (fields.source !== undefined) patch.source = fields.source || null;
  const { error } = await db().from("papers").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await log(id, me.id, "details");
  refreshPaper(id);
  return { ok: true };
}

// Removes papers and everything recorded for them (votes, coding, effect rows, history, PDF).
export async function deletePapers(ids: string[]): Promise<{ ok: boolean; deleted: number; error?: string }> {
  await requireMember();
  const d = db();
  let deleted = 0;
  for (const id of ids.filter((x) => typeof x === "string" && x)) {
    const { data } = await d.from("papers").select("id,pdf_path").eq("id", id).maybeSingle();
    if (!data) continue;
    const { error } = await d.from("papers").delete().eq("id", id);
    if (error) return { ok: false, deleted, error: error.message };
    if (data.pdf_path) await d.storage.from(PDF_BUCKET).remove([data.pdf_path]);
    deleted++;
  }
  revalidatePath("/papers");
  revalidatePath("/search");
  revalidatePath("/dataset");
  revalidatePath("/");
  return { ok: true, deleted };
}

export async function deletePaper(id: string): Promise<Result> {
  const r = await deletePapers([id]);
  return r.ok ? { ok: true } : { ok: false, error: r.error || "unknown error" };
}

// Form action for the master list: the checked papers are deleted, then the list reloads.
export async function deleteSelected(formData: FormData) {
  const ids = formData.getAll("ids").map(String);
  const back = String(formData.get("back") || "/");
  if (ids.length) await deletePapers(ids);
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}

// The team's final decision on a paper, recorded after talking it through. It overrides the votes either way; null clears it.
export async function setPiDecision(paperId: string, decision: "include" | "exclude" | null, note: string): Promise<Result> {
  const me = await requireMember();
  const patch = decision
    ? { pi_decision: decision, pi_note: note || null, pi_by: me.id, pi_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { pi_decision: null, pi_note: null, pi_by: null, pi_at: null, updated_at: new Date().toISOString() };
  const { error } = await db().from("papers").update(patch).eq("id", paperId);
  if (error) return { ok: false, error: error.message };
  await log(paperId, me.id, "pi_decision", decision ? (decision === "include" ? "approved" : "rejected") + (note ? ` (${note})` : "") : null);
  refreshPaper(paperId);
  return { ok: true };
}

// ---------- PDF upload ----------

export async function signedUpload(filename: string): Promise<{ ok: true; path: string; url: string } | { ok: false; error: string }> {
  await requireMember();
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
  const { data, error } = await db().storage.from(PDF_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Storage is not ready: " + (error?.message || "no upload link") + ". Check that the pdfs bucket exists in Supabase." };
  return { ok: true, path, url: data.signedUrl };
}

// Postgres cannot store the NUL character (\u0000) in text or jsonb, and PDF text extraction
// sometimes produces it, along with other control characters and broken surrogate pairs.
function cleanText(t: string): string {
  return t
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

async function extractPages(path: string): Promise<{ pages: string[]; text: string }> {
  const { data, error } = await db().storage.from(PDF_BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "download failed");
  const buf = new Uint8Array(await data.arrayBuffer());
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [String(text)]).map((t) => cleanText(t).replace(/[ \t]+\n/g, "\n").trim());
  return { pages, text: pages.join("\n\n") };
}

// Without a DOI match, the title is guessed from the first page: the first early line that does
// not look like a journal header, a date line, or an author list, plus the lines it wraps onto.
function guessTitle(firstPage: string): string {
  const lines = firstPage.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 14);
  const noise = /journal|available online|received|accepted|published|copyright|rights reserved|elsevier|springer|wiley|sage|taylor|doi|https?:|www\.|issn|volume|vol\.|\(\d{4}\)|^\d|@|university|department|abstract|keywords|correspond/i;
  const authorish = (l: string) =>
    (l.match(/,/g) || []).length >= 2 ||            // Smith, J., Lee, A.
    /[A-Za-z]\d\b/.test(l) || /[*\u2020\u2021]/.test(l) || // affiliation marks: Brown1, Graso a,*
    (/\band\b/.test(l) && /^(?:[A-Z][\w.'-]*\s+){1,}(?:and\s+)(?:[A-Z][\w.'-]*\s*)+$/.test(l)); // Susan Brown and Lee Park
  const parts: string[] = [];
  for (const l of lines) {
    if (parts.length === 0) {
      if (l.length >= 20 && l.length <= 220 && !noise.test(l) && !authorish(l)) parts.push(l);
      continue;
    }
    if (noise.test(l) || authorish(l) || l.length > 120 || parts.length >= 3) break;
    parts.push(l);
  }
  return parts.join(" ").replace(/\s+/g, " ").slice(0, 250);
}

export type UploadResult =
  | { ok: true; id: string; duplicate: boolean; textRead: boolean }
  | { ok: false; error: string };

// Attach an uploaded PDF to an existing paper, or create a new paper from it.
export async function finalizeUpload(path: string, filename: string, paperId?: string, source?: string, stage: Stage = "master"): Promise<UploadResult> {
  const me = await requireMember();
  const d = db();
  let pages: string[] = [];
  let text = "";
  try {
    const r = await extractPages(path);
    pages = r.pages; text = r.text;
  } catch (e) {
    console.error("pdf text extraction failed", path, e);
  }
  const textRead = pages.some((p) => p.length > 0);

  // Save the file link first, then the text, so a text problem can never lose the PDF.
  async function attach(id: string): Promise<string | null> {
    const { error: e1 } = await d.from("papers").update({ pdf_path: path, updated_at: new Date().toISOString() }).eq("id", id);
    if (e1) return e1.message;
    const { error: e2 } = await d.from("papers").update({ pages: textRead ? pages : null }).eq("id", id);
    if (e2) console.error("saving extracted text failed", id, e2.message);
    await log(id, me.id, "pdf");
    return null;
  }

  if (paperId) {
    const { data: old } = await d.from("papers").select("pdf_path").eq("id", paperId).maybeSingle();
    const err = await attach(paperId);
    if (err) {
      await d.storage.from(PDF_BUCKET).remove([path]);
      return { ok: false, error: "The PDF could not be attached: " + err };
    }
    if (old?.pdf_path && old.pdf_path !== path) await d.storage.from(PDF_BUCKET).remove([old.pdf_path]);
    refreshPaper(paperId);
    return { ok: true, id: paperId, duplicate: false, textRead };
  }

  const doi = extractDOI(text.slice(0, 6000)) || extractDOI(text);
  let meta: ParsedPaper = { title: "", authors: "", year: null, journal: "", doi, abstract: "" };
  if (doi) {
    const hit = await lookupDOI(doi);
    if (hit) meta = { ...meta, ...hit, doi };
  }
  if (!meta.title) meta.title = guessTitle(pages[0] || "") || filename.replace(/\.pdf$/i, "");
  meta.title = cleanText(meta.title);
  meta.abstract = cleanText(meta.abstract);

  const dup = await findDuplicate(meta.doi, meta.title);
  if (dup) {
    const { data: old } = await d.from("papers").select("pdf_path").eq("id", dup).maybeSingle();
    if (!old?.pdf_path) {
      const err = await attach(dup);
      if (err) {
        await d.storage.from(PDF_BUCKET).remove([path]);
        return { ok: false, error: "The PDF could not be attached: " + err };
      }
    } else {
      await d.storage.from(PDF_BUCKET).remove([path]);
    }
    refreshPaper(dup);
    return { ok: true, id: dup, duplicate: true, textRead };
  }

  const src = (source || "").trim() || "upload";
  const { data, error } = await d
    .from("papers")
    .insert({
      title: meta.title || null,
      authors: meta.authors || null,
      first_author: firstAuthor(meta.authors) || null,
      year: meta.year,
      journal: meta.journal || null,
      doi: meta.doi || null,
      abstract: meta.abstract || null,
      source: src,
      pdf_path: path,
      added_by: me.id,
      stage: stage === "search" ? "search" : "master",
      title_key: titleKey(meta.title) || null,
    })
    .select("id")
    .single();
  if (error || !data) {
    await d.storage.from(PDF_BUCKET).remove([path]);
    return { ok: false, error: "The paper could not be saved: " + (error?.message || "unknown error") };
  }
  if (textRead) {
    const { error: e2 } = await d.from("papers").update({ pages }).eq("id", data.id);
    if (e2) console.error("saving extracted text failed", data.id, e2.message);
  }
  await log(data.id, me.id, "added", src + ", with PDF" + (stage === "search" ? ", to the search list" : ""));
  revalidatePath("/papers");
  revalidatePath("/search");
  revalidatePath("/");
  return { ok: true, id: data.id, duplicate: false, textRead };
}

export async function reExtractText(paperId: string): Promise<{ ok: boolean; error?: string; textRead?: boolean }> {
  await requireMember();
  const d = db();
  const { data } = await d.from("papers").select("pdf_path").eq("id", paperId).maybeSingle();
  if (!data?.pdf_path) return { ok: false, error: "No PDF is attached." };
  try {
    const { pages } = await extractPages(data.pdf_path);
    const textRead = pages.some((p) => p.length > 0);
    const { error } = await d.from("papers").update({ pages: textRead ? pages : null }).eq("id", paperId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/papers/${paperId}`);
    return { ok: true, textRead };
  } catch (e: any) {
    return { ok: false, error: e?.message || "The text could not be read." };
  }
}

// ---------- votes ----------

export async function saveVote(paperId: string, decision: Decision, reason: string, notes: string): Promise<Result> {
  const me = await requireMember();
  const { error } = await db().from("votes").upsert(
    { paper_id: paperId, member_id: me.id, decision, reason: decision === "exclude" ? reason || null : null, notes: notes || null, updated_at: new Date().toISOString() },
    { onConflict: "paper_id,member_id" }
  );
  if (error) return { ok: false, error: error.message };
  const word = decision === "include" ? "Include" : decision === "exclude" ? "Exclude" : "Not sure";
  await log(paperId, me.id, "vote", word + (decision === "exclude" && reason ? ` (${reason})` : ""));
  refreshPaper(paperId);
  return { ok: true };
}

// ---------- coding (one shared form per paper) ----------

const CODING_NUMERIC = ["dosage_sessions", "dosage_weeks", "age_min", "age_max", "n_total", "pct_black", "pct_latinx", "pct_low_income"];
const CODING_SAVE_KEYS = [...CODING_KEYS, "notes"];

async function currentCoding(paperId: string): Promise<{ id: string; done: boolean } | null> {
  const { data } = await db().from("codings").select("id,done,updated_at").eq("paper_id", paperId).order("updated_at", { ascending: false }).limit(1);
  const row = (data || [])[0];
  return row ? { id: row.id, done: Boolean(row.done) } : null;
}

export type SaveCodingResult = { ok: true; warning?: string } | { ok: false; error: string };

// Saves the shared form. `evidence` is the per-field quote and page (from the AI fill), kept so
// anyone can hover a field later and see where the value came from.
export async function saveCoding(paperId: string, fields: Record<string, unknown>, evidence?: EvidenceMap | null, aiAssisted?: boolean): Promise<SaveCodingResult> {
  const me = await requireMember();
  const row: Record<string, unknown> = { updated_by: me.id, updated_at: new Date().toISOString() };
  for (const k of CODING_SAVE_KEYS) {
    const v = fields[k];
    if (v === undefined) continue;
    if (CODING_NUMERIC.includes(k)) row[k] = v === "" || v === null ? null : Number(v);
    else if (k === "single_group_sample") row[k] = v === "" || v === null ? null : v === true || v === "true";
    else row[k] = v === "" ? null : v;
  }
  if (evidence !== undefined) row.evidence = evidence && Object.keys(evidence).length ? evidence : null;
  if (aiAssisted !== undefined) row.ai_assisted = Boolean(aiAssisted);
  const d = db();
  const cur = await currentCoding(paperId);
  const write = async (r: Record<string, unknown>) =>
    cur ? d.from("codings").update(r).eq("id", cur.id) : d.from("codings").insert({ ...r, paper_id: paperId, coder_id: me.id });
  let { error } = await write(row);
  let warning: string | undefined;
  if (error && /evidence|ai_assisted/i.test(error.message)) {
    // The database has not had migrate_v3b.sql yet: save the values, drop the evidence.
    const { evidence: _e, ai_assisted: _a, ...rest } = row;
    ({ error } = await write(rest));
    if (!error) warning = "Saved, but the quotes behind the values were not kept: run supabase/migrate_v3b.sql in Supabase once.";
  }
  if (error) return { ok: false, error: error.message };
  await log(paperId, me.id, "coding", aiAssisted ? "AI-filled, checked" : null);
  refreshPaper(paperId);
  return warning ? { ok: true, warning } : { ok: true };
}

// Asks the AI model to read the paper's text and propose a value plus a quote for every field.
export async function draftCoding(paperId: string): Promise<CodingDraftResult> {
  const me = await requireMember();
  const r = await draftCodingFromPaper(paperId);
  if (r.ok) await log(paperId, me.id, "ai_draft", `study features from ${r.pagesRead === r.pagesTotal ? "all " : ""}${r.pagesRead}${r.pagesRead === r.pagesTotal ? "" : ` of ${r.pagesTotal}`} page${r.pagesTotal === 1 ? "" : "s"} of text`);
  return r;
}

// Marks the paper finished (features and numbers both entered) or reopens it.
export async function setDone(paperId: string, done: boolean): Promise<Result> {
  const me = await requireMember();
  const d = db();
  const cur = await currentCoding(paperId);
  const stamp = { done, updated_by: me.id, updated_at: new Date().toISOString() };
  if (cur) {
    const { error } = await d.from("codings").update(stamp).eq("id", cur.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await d.from("codings").insert({ ...stamp, paper_id: paperId, coder_id: me.id });
    if (error) return { ok: false, error: error.message };
  }
  await log(paperId, me.id, done ? "done" : "reopened");
  refreshPaper(paperId);
  return { ok: true };
}

// ---------- effects ----------

const EFFECT_NUMERIC = [
  "m_t_n", "m_t_mean", "m_t_sd", "m_t_events", "m_c_n", "m_c_mean", "m_c_sd", "m_c_events",
  "c_t_n", "c_t_mean", "c_t_sd", "c_t_events", "c_c_n", "c_c_mean", "c_c_sd", "c_c_events",
  "sg_d_m", "sg_se_m", "sg_d_c", "sg_se_c", "int_coef", "int_se", "page",
];
const EFFECT_TEXT = [
  "outcome_family", "outcome_name", "outcome_type", "timepoint", "group_dimension", "marginalized_group",
  "comparison_group", "tier", "int_scale", "source_label", "quote", "notes",
];

export async function saveEffect(paperId: string, effectId: string | null, fields: Record<string, unknown>, aiAssisted = false): Promise<Result> {
  const me = await requireMember();
  const row: Record<string, unknown> = { paper_id: paperId, updated_by: me.id, updated_at: new Date().toISOString() };
  for (const k of EFFECT_NUMERIC) {
    const v = fields[k];
    row[k] = v === "" || v === null || v === undefined ? null : Number(v);
  }
  for (const k of EFFECT_TEXT) {
    const v = fields[k];
    row[k] = v === "" || v === undefined ? null : v;
  }
  row.higher_is_worse = fields.higher_is_worse === true || fields.higher_is_worse === "true";
  const computed = computeEffect(row as any);
  Object.assign(row, computed);
  const label = [fields.outcome_name, fields.timepoint].filter(Boolean).join(", ") || String(fields.outcome_family || "");

  const d = db();
  if (effectId) {
    const { error } = await d.from("effects").update(row).eq("id", effectId);
    if (error) return { ok: false, error: error.message };
    await log(paperId, me.id, "effect_edit", label);
  } else {
    row.entered_by = me.id;
    row.ai_assisted = aiAssisted;
    const { error } = await d.from("effects").insert(row);
    if (error) return { ok: false, error: error.message };
    await log(paperId, me.id, "effect_add", label + (aiAssisted ? ", from an AI draft" : ""));
  }
  refreshPaper(paperId);
  return { ok: true };
}

export async function deleteEffect(paperId: string, effectId: string): Promise<Result> {
  const me = await requireMember();
  const d = db();
  const { data } = await d.from("effects").select("outcome_name,timepoint").eq("id", effectId).maybeSingle();
  const { error } = await d.from("effects").delete().eq("id", effectId);
  if (error) return { ok: false, error: error.message };
  await log(paperId, me.id, "effect_delete", [data?.outcome_name, data?.timepoint].filter(Boolean).join(", "));
  refreshPaper(paperId);
  return { ok: true };
}

// ---------- AI draft ----------

// Asks the AI model to read a screenshot of a results table (or pages of the paper's text) and
// propose effect rows. Nothing is saved: the person checks each row and saves it themselves.
export async function draftEffects(paperId: string, input: DraftInput): Promise<DraftResult> {
  const me = await requireMember();
  const r = await draftFromPaper(paperId, input);
  if (r.ok) await log(paperId, me.id, "ai_draft", `${r.candidates.length} row${r.candidates.length === 1 ? "" : "s"} from ${input.image ? "a screenshot" : "the paper's text"}`);
  return r;
}

// ---------- step 1: search ----------

export type SearchInput = { query: string; dbs: string[]; limit: number; yearFrom: number | null; yearTo: number | null };

// Runs one query across the chosen databases and files the new hits in the search list.
export async function runSearchAction(input: SearchInput): Promise<RunSummary> {
  const me = await requireMember();
  const dbs = (input.dbs || []).filter(isDb) as Db[];
  const yf = Number(input.yearFrom); const yt = Number(input.yearTo);
  const r = await runSearch({
    query: String(input.query || ""),
    dbs,
    limit: Math.min(MAX_PER_DB, Math.max(1, Number(input.limit) || 200)),
    yearFrom: Number.isFinite(yf) && yf > 1800 ? yf : null,
    yearTo: Number.isFinite(yt) && yt > 1800 ? yt : null,
  }, me.id);
  if (r.ok) {
    await log(null, me.id, "search", `"${r.query}" in ${dbs.join(", ")}: ${r.pulled} pulled, ${r.added} new`);
    revalidatePath("/search");
    revalidatePath("/");
  }
  return r;
}

// ---------- step 1: screening ----------

async function screensFor(paperId: string): Promise<Screen[]> {
  const { data } = await db().from("screens").select("*").eq("paper_id", paperId);
  return (data || []) as Screen[];
}

// Moves a candidate into the master list (one Relevant mark, or a recorded decision).
async function promote(paperId: string, memberId: string): Promise<string | null> {
  const { error } = await db().from("papers").update({ stage: "master", screened_in_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", paperId);
  if (error) return error.message;
  await log(paperId, memberId, "screened_in");
  return null;
}

export type ScreenResult = { ok: true; status: "pending" | "in" | "out" | "split"; moved: boolean } | { ok: false; error: string };

// Saves one person's mark on a candidate and applies the rule: one Relevant (and no Not relevant)
// moves it to the master list; decision null clears the person's mark.
export async function saveScreen(paperId: string, decision: ScreenMark | null, reason?: string): Promise<ScreenResult> {
  const me = await requireMember();
  const d = db();
  const { data: paper, error: pe } = await d.from("papers").select("id,stage,screen_decision").eq("id", paperId).maybeSingle();
  if (pe) return { ok: false, error: pe.message };
  if (!paper) return { ok: false, error: "This paper no longer exists." };
  if (paper.stage !== "search") return { ok: false, error: "This paper is already in the master list." };
  if (decision === null) {
    const { error } = await d.from("screens").delete().eq("paper_id", paperId).eq("member_id", me.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await d.from("screens").upsert(
      { paper_id: paperId, member_id: me.id, decision, reason: reason || null, updated_at: new Date().toISOString() },
      { onConflict: "paper_id,member_id" }
    );
    if (error) return { ok: false, error: error.message };
    await log(paperId, me.id, "screen", decision === "relevant" ? "Relevant" : decision === "not_relevant" ? "Not relevant" + (reason ? ` (${reason})` : "") : "Unsure");
  }
  const s = screenStanding(paper, await screensFor(paperId));
  let moved = false;
  if (s.status === "in") {
    const err = await promote(paperId, me.id);
    if (err) return { ok: false, error: err };
    moved = true;
  }
  revalidatePath("/search");
  revalidatePath("/");
  revalidatePath(`/papers/${paperId}`);
  return { ok: true, status: s.status, moved };
}

// The same mark on several candidates at once (the ticked rows of the search list).
export async function screenMany(ids: string[], decision: ScreenMark): Promise<{ ok: boolean; done: number; moved: number; error?: string }> {
  let done = 0, moved = 0;
  for (const id of ids.filter((x) => typeof x === "string" && x).slice(0, 500)) {
    const r = await saveScreen(id, decision);
    if (!r.ok) return { ok: false, done, moved, error: r.error };
    done++;
    if (r.moved) moved++;
  }
  return { ok: true, done, moved };
}

// A recorded screening decision, for candidates people disagree on: in = move to the master list, out = screen out, null = let the marks decide again.
export async function setScreenDecision(paperId: string, decision: "in" | "out" | null): Promise<ScreenResult> {
  const me = await requireMember();
  const d = db();
  const patch = decision
    ? { screen_decision: decision, screen_by: me.id, screen_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    : { screen_decision: null, screen_by: null, screen_at: null, updated_at: new Date().toISOString() };
  const { error } = await d.from("papers").update(patch).eq("id", paperId);
  if (error) return { ok: false, error: error.message };
  await log(paperId, me.id, "screen_decision", decision === "in" ? "moved to the master list" : decision === "out" ? "screened out" : null);
  let moved = false;
  if (decision === "in") {
    const err = await promote(paperId, me.id);
    if (err) return { ok: false, error: err };
    moved = true;
  }
  const { data: paper } = await d.from("papers").select("screen_decision").eq("id", paperId).maybeSingle();
  const s = screenStanding(paper || { screen_decision: decision }, await screensFor(paperId));
  revalidatePath("/search");
  revalidatePath("/");
  revalidatePath(`/papers/${paperId}`);
  return { ok: true, status: s.status, moved };
}

// Sends a paper from the master list back to the search list (it was moved by mistake).
export async function backToSearch(paperId: string): Promise<Result> {
  const me = await requireMember();
  const d = db();
  const { error } = await d.from("papers").update({ stage: "search", screen_decision: null, screen_by: null, screen_at: null, screened_in_at: null, updated_at: new Date().toISOString() }).eq("id", paperId);
  if (error) return { ok: false, error: error.message };
  await d.from("screens").delete().eq("paper_id", paperId);
  await log(paperId, me.id, "back_to_search");
  refreshPaper(paperId);
  return { ok: true };
}

// ---------- step 1: keyword bank ----------

// The shared list of keywords still to try. A missing table (migrate_v4.sql not run) comes back as an error string.
export async function loadKeywordIdeas(): Promise<{ ideas: KeywordIdea[]; error: string | null }> {
  const { data, error } = await db().from("keyword_ideas").select("id,text,note,added_by,created_at").order("created_at", { ascending: true });
  if (error) return { ideas: [], error: error.message };
  return { ideas: (data || []) as KeywordIdea[], error: null };
}

export async function addKeywordIdea(text: string, note: string): Promise<Result> {
  const me = await requireMember();
  const t = String(text || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!t) return { ok: false, error: "Type the keyword or query first." };
  const { error } = await db().from("keyword_ideas").insert({ text: t, note: String(note || "").trim().slice(0, 500) || null, added_by: me.id });
  if (error) return { ok: false, error: /keyword_ideas/i.test(error.message) ? "The database has not been updated for this version yet: run supabase/migrate_v4.sql in Supabase." : error.message };
  await log(null, me.id, "keyword_idea", t);
  revalidatePath("/search");
  return { ok: true };
}

export async function removeKeywordIdea(id: string): Promise<Result> {
  await requireMember();
  const { error } = await db().from("keyword_ideas").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/search");
  return { ok: true };
}

// ---------- step 1: AI pre-screen ----------

const CRITERIA_KEY = "screen_criteria";

export async function loadScreenCriteria(): Promise<string> {
  const { data } = await db().from("settings").select("value").eq("key", CRITERIA_KEY).maybeSingle();
  return (data?.value as string) || DEFAULT_SCREEN_CRITERIA;
}

export async function saveScreenCriteria(text: string): Promise<Result> {
  const me = await requireMember();
  const value = String(text || "").trim() || DEFAULT_SCREEN_CRITERIA;
  const { error } = await db().from("settings").upsert({ key: CRITERIA_KEY, value, updated_by: me.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type PrescreenBatch = { ok: true; done: number; left: number; model: string } | { ok: false; error: string };

// Asks the AI about the next batch of candidates it has not seen. The client calls this again
// until `left` is 0, so a long list is handled in small pieces that each fit one request.
export async function aiPrescreen(batch = 25): Promise<PrescreenBatch> {
  const me = await requireMember();
  const d = db();
  const size = Math.max(1, Math.min(40, Math.floor(batch) || 25));
  const { data, error } = await d.from("papers").select("id,title,year,journal,abstract").eq("stage", "search").is("ai_screen", null).order("created_at", { ascending: true }).limit(size);
  if (error) return { ok: false, error: error.message };
  const items = (data || []) as ScreenItem[];
  if (items.length === 0) return { ok: true, done: 0, left: 0, model: "" };
  const criteria = await loadScreenCriteria();
  const r = await prescreenCandidates(items, criteria);
  if (!r.ok) return r;
  const at = new Date().toISOString();
  for (const it of items) {
    const v = r.verdicts[it.id] || { verdict: "unclear", reason: "The AI gave no answer for this record." };
    await d.from("papers").update({ ai_screen: { ...v, at, model: r.model } }).eq("id", it.id);
  }
  await log(null, me.id, "ai_screen", `${items.length} candidates pre-screened`);
  const { data: rest } = await d.from("papers").select("id").eq("stage", "search").is("ai_screen", null).limit(1000);
  revalidatePath("/search");
  return { ok: true, done: items.length, left: (rest || []).length, model: r.model };
}

// Forgets the AI's hints so a changed set of criteria can be run again.
export async function clearAiScreen(): Promise<Result> {
  await requireMember();
  const { error } = await db().from("papers").update({ ai_screen: null }).eq("stage", "search");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/search");
  return { ok: true };
}
