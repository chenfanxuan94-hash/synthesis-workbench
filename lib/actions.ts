"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, PDF_BUCKET } from "./supabase";
import { COOKIE, requireMember } from "./session";
import { computeEffect } from "./effects";
import { lookupDOI } from "./crossref";
import { cleanDOI, extractDOI, firstAuthor, initialsFor, type ParsedPaper } from "./parsers";
import type { Decision, Stage } from "./types";

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
    const { data } = await d.from("papers").select("id").ilike("title", title.trim()).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

export async function createPaper(p: ParsedPaper & { source?: string }): Promise<{ id: string; duplicate: boolean }> {
  const me = await requireMember();
  const doi = cleanDOI(p.doi);
  const dup = await findDuplicate(doi, p.title);
  if (dup) return { id: dup, duplicate: true };
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
      source: p.source || "manual",
      added_by: me.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/papers");
  revalidatePath("/");
  return { id: data.id, duplicate: false };
}

export async function importPapers(list: ParsedPaper[], source: string): Promise<{ added: number; skipped: number }> {
  let added = 0, skipped = 0;
  for (const p of list) {
    const r = await createPaper({ ...p, source });
    if (r.duplicate) skipped++; else added++;
  }
  return { added, skipped };
}

export async function updatePaper(id: string, fields: Partial<ParsedPaper> & { source?: string }) {
  await requireMember();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.title !== undefined) patch.title = fields.title || null;
  if (fields.authors !== undefined) { patch.authors = fields.authors || null; patch.first_author = firstAuthor(fields.authors) || null; }
  if (fields.year !== undefined) patch.year = fields.year;
  if (fields.journal !== undefined) patch.journal = fields.journal || null;
  if (fields.doi !== undefined) patch.doi = cleanDOI(fields.doi) || null;
  if (fields.abstract !== undefined) patch.abstract = fields.abstract || null;
  if (fields.source !== undefined) patch.source = fields.source || null;
  const { error } = await db().from("papers").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/papers/${id}`);
  revalidatePath("/papers");
}

export async function deletePaper(id: string) {
  await requireMember();
  const d = db();
  const { data } = await d.from("papers").select("pdf_path").eq("id", id).maybeSingle();
  if (data?.pdf_path) await d.storage.from(PDF_BUCKET).remove([data.pdf_path]);
  await d.from("papers").delete().eq("id", id);
  revalidatePath("/papers");
  redirect("/papers");
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

export type UploadResult =
  | { ok: true; id: string; duplicate: boolean; textRead: boolean }
  | { ok: false; error: string };

// Attach an uploaded PDF to an existing paper, or create a new paper from it.
// Errors are returned rather than thrown, because Next.js hides thrown messages in production.
export async function finalizeUpload(path: string, filename: string, paperId?: string, source?: string): Promise<UploadResult> {
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
    revalidatePath(`/papers/${paperId}`);
    return { ok: true, id: paperId, duplicate: false, textRead };
  }

  const doi = extractDOI(text.slice(0, 6000)) || extractDOI(text);
  let meta: ParsedPaper = { title: "", authors: "", year: null, journal: "", doi, abstract: "" };
  if (doi) {
    const hit = await lookupDOI(doi);
    if (hit) meta = { ...meta, ...hit, doi };
  }
  if (!meta.title) {
    const firstLine = (pages[0] || "").split("\n").map((s) => s.trim()).find((s) => s.length > 20 && s.length < 200);
    meta.title = firstLine || filename.replace(/\.pdf$/i, "");
  }
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
    revalidatePath(`/papers/${dup}`);
    return { ok: true, id: dup, duplicate: true, textRead };
  }

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
      source: (source || "").trim() || "upload",
      pdf_path: path,
      added_by: me.id,
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
  revalidatePath("/papers");
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

// ---------- screening ----------

export async function saveScreening(paperId: string, stage: Stage, decision: Decision, reason: string, notes: string) {
  const me = await requireMember();
  const { error } = await db().from("screenings").upsert(
    { paper_id: paperId, member_id: me.id, stage, decision, reason: reason || null, notes: notes || null, updated_at: new Date().toISOString() },
    { onConflict: "paper_id,member_id,stage" }
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/papers");
  revalidatePath("/conflicts");
  revalidatePath("/");
}

export async function resolveConflict(paperId: string, stage: Stage, decision: "include" | "exclude", reason: string) {
  const me = await requireMember();
  const patch: Record<string, unknown> = { override_reason: reason || null, override_by: me.id, updated_at: new Date().toISOString() };
  if (stage === "abstract") patch.abstract_override = decision; else patch.fulltext_override = decision;
  const { error } = await db().from("papers").update(patch).eq("id", paperId);
  if (error) throw new Error(error.message);
  revalidatePath("/conflicts");
  revalidatePath("/papers");
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/");
}

// ---------- coding ----------

export async function saveCoding(paperId: string, fields: Record<string, unknown>) {
  const me = await requireMember();
  const numeric = ["dosage_sessions", "dosage_weeks", "age_min", "age_max", "n_total", "pct_black", "pct_latinx", "pct_low_income"];
  const row: Record<string, unknown> = { paper_id: paperId, coder_id: me.id, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (numeric.includes(k)) row[k] = v === "" || v === null || v === undefined ? null : Number(v);
    else if (k === "single_group_sample") row[k] = v === "" || v === null ? null : v === true || v === "true";
    else row[k] = v === "" ? null : v;
  }
  const { error } = await db().from("codings").upsert(row, { onConflict: "paper_id,coder_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/dataset");
}

export async function markCodingFinal(paperId: string, codingId: string) {
  await requireMember();
  const d = db();
  await d.from("codings").update({ is_final: false }).eq("paper_id", paperId);
  await d.from("codings").update({ is_final: true }).eq("id", codingId);
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/dataset");
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

export async function saveEffect(paperId: string, effectId: string | null, fields: Record<string, unknown>) {
  const me = await requireMember();
  const row: Record<string, unknown> = { paper_id: paperId, updated_at: new Date().toISOString() };
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

  const d = db();
  if (effectId) {
    row.verified_by = null; // any edit clears verification
    const { error } = await d.from("effects").update(row).eq("id", effectId);
    if (error) throw new Error(error.message);
  } else {
    row.entered_by = me.id;
    const { error } = await d.from("effects").insert(row);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/dataset");
  revalidatePath("/");
}

export async function verifyEffect(paperId: string, effectId: string, verified: boolean) {
  const me = await requireMember();
  await db().from("effects").update({ verified_by: verified ? me.id : null }).eq("id", effectId);
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/dataset");
}

export async function deleteEffect(paperId: string, effectId: string) {
  await requireMember();
  await db().from("effects").delete().eq("id", effectId);
  revalidatePath(`/papers/${paperId}`);
  revalidatePath("/dataset");
}
