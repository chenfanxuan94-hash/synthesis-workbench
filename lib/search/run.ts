// Runs one query across the chosen databases, merges the hits (the same paper from two
// databases becomes one candidate), skips papers already in the library, and saves the new
// candidates in the search list with a record of which search found them.
import { db } from "../supabase";
import { firstAuthor } from "../parsers";
import { titleKey } from "../screening";
import { DBS, DB_LABEL, searchDb, type Db, type DbResult, type Hit } from "./providers";

export type DbSummary = { found: number; pulled: number; added: number; dup: number; error: string | null; capped: boolean };

export type RunSummary =
  | { ok: true; searchId: string | null; query: string; per: Partial<Record<Db, DbSummary>>; pulled: number; merged: number; added: number; existing: number; errors: string[] }
  | { ok: false; error: string };

type Cand = { hit: Hit; dbs: Db[]; ids: Record<string, string> };

export const MAX_PER_DB = 1000;

function keysOf(h: Hit): string[] {
  const keys: string[] = [];
  if (h.doi) keys.push("doi:" + h.doi.toLowerCase());
  if (h.pmid) keys.push("pmid:" + h.pmid);
  const t = titleKey(h.title);
  if (t.length >= 12) keys.push("t:" + t);
  return keys;
}

// Fills gaps in the first hit from a second one for the same paper.
function mergeInto(a: Hit, b: Hit) {
  if (!a.abstract && b.abstract) a.abstract = b.abstract;
  if ((!a.abstract || a.abstract.length < 80) && b.abstract && b.abstract.length > (a.abstract?.length || 0)) a.abstract = b.abstract;
  if (!a.doi && b.doi) a.doi = b.doi;
  if (!a.pmid && b.pmid) a.pmid = b.pmid;
  if (!a.journal && b.journal) a.journal = b.journal;
  if (!a.year && b.year) a.year = b.year;
  if ((!a.authors || a.authors.length < (b.authors?.length || 0) / 2) && b.authors) a.authors = b.authors;
  if (!a.title && b.title) a.title = b.title;
  if (b.cited_by !== null && (a.cited_by === null || b.cited_by > a.cited_by)) a.cited_by = b.cited_by;
  const seen = new Set(a.keywords.map((k) => k.toLowerCase()));
  for (const k of b.keywords) if (!seen.has(k.toLowerCase()) && a.keywords.length < 30) { a.keywords.push(k); seen.add(k.toLowerCase()); }
  if (!a.url && b.url) a.url = b.url;
}

// One list of candidates out of every database's hits.
export function mergeHits(results: DbResult[]): Cand[] {
  const byKey = new Map<string, Cand>();
  const cands: Cand[] = [];
  for (const r of results) {
    for (const h of r.hits) {
      if (!h.title && !h.doi) continue;
      const keys = keysOf(h);
      let c: Cand | undefined;
      for (const k of keys) { c = byKey.get(k); if (c) break; }
      if (!c) {
        c = { hit: { ...h, keywords: [...h.keywords] }, dbs: [h.db], ids: { [h.db]: h.external_id } };
        cands.push(c);
      } else {
        mergeInto(c.hit, h);
        if (!c.dbs.includes(h.db)) c.dbs.push(h.db);
        if (!c.ids[h.db]) c.ids[h.db] = h.external_id;
      }
      for (const k of keys) byKey.set(k, c);
    }
  }
  return cands;
}

type Existing = { id: string; doi: string | null; pmid: string | null; title_key: string | null; found_by: any; stage: string | null };

async function chunkedIn(column: string, values: string[]): Promise<{ rows: Existing[]; error: string | null }> {
  const rows: Existing[] = [];
  for (let i = 0; i < values.length; i += 150) {
    const { data, error } = await db().from("papers").select("id,doi,pmid,title_key,found_by,stage").in(column, values.slice(i, i + 150));
    if (error) return { rows, error: error.message };
    rows.push(...((data || []) as Existing[]));
  }
  return { rows, error: null };
}

export type RunInput = { query: string; dbs: Db[]; limit: number; yearFrom: number | null; yearTo: number | null };

export async function runSearch(input: RunInput, memberId: string): Promise<RunSummary> {
  const query = input.query.trim();
  if (!query) return { ok: false, error: "Type something to search for." };
  const dbs = input.dbs.filter((d, i, arr) => DBS.some((x) => x.id === d) && arr.indexOf(d) === i);
  if (dbs.length === 0) return { ok: false, error: "Tick at least one database." };
  const limit = Math.max(1, Math.min(MAX_PER_DB, Math.floor(input.limit) || 200));
  const opts = { limit, yearFrom: input.yearFrom, yearTo: input.yearTo };

  const results = await Promise.all(dbs.map((d) => searchDb(d, query, opts)));
  const cands = mergeHits(results);

  // Which candidates are already in the library (search list or master list)?
  const dois = cands.map((c) => c.hit.doi?.toLowerCase()).filter((x): x is string => Boolean(x));
  const pmids = cands.map((c) => c.hit.pmid).filter((x): x is string => Boolean(x));
  const tkeys = cands.map((c) => titleKey(c.hit.title)).filter((x) => x.length >= 12);
  const found: Existing[] = [];
  for (const [col, vals] of [["doi", dois], ["pmid", pmids], ["title_key", tkeys]] as [string, string[]][]) {
    if (vals.length === 0) continue;
    const r = await chunkedIn(col, vals);
    if (r.error) return { ok: false, error: /pmid|title_key|stage|found_by/i.test(r.error) ? "The database has not been updated for this version yet: run supabase/migrate_v4.sql in the Supabase SQL editor." : r.error };
    found.push(...r.rows);
  }
  const byDoi = new Map<string, Existing>(), byPmid = new Map<string, Existing>(), byTitle = new Map<string, Existing>();
  for (const e of found) {
    if (e.doi) byDoi.set(e.doi.toLowerCase(), e);
    if (e.pmid) byPmid.set(e.pmid, e);
    if (e.title_key) byTitle.set(e.title_key, e);
  }
  const now = new Date().toISOString();
  const toInsert: { c: Cand; row: Record<string, unknown> }[] = [];
  const toUpdate = new Map<string, { e: Existing; c: Cand }>();
  for (const c of cands) {
    const h = c.hit;
    const e = (h.doi && byDoi.get(h.doi.toLowerCase())) || (h.pmid && byPmid.get(h.pmid)) || byTitle.get(titleKey(h.title)) || null;
    if (e) { if (!toUpdate.has(e.id)) toUpdate.set(e.id, { e, c }); continue; }
    const row: Record<string, unknown> = {
      title: h.title || null,
      authors: h.authors,
      first_author: firstAuthor(h.authors) || null,
      year: h.year,
      journal: h.journal,
      doi: h.doi ? h.doi.toLowerCase() : null,
      abstract: h.abstract,
      source: "search: " + DB_LABEL[c.dbs[0]],
      pmid: h.pmid,
      external_ids: c.ids,
      keywords: h.keywords,
      cited_by: h.cited_by,
      found_by: c.dbs.map((d) => ({ q: query, db: d, at: now, id: c.ids[d] || null })),
      title_key: titleKey(h.title) || null,
      stage: "search",
      added_by: memberId,
    };
    toInsert.push({ c, row });
  }

  // Insert the new candidates. A chunk that fails (for example a DOI that slipped past the
  // check) is retried one row at a time, so one bad row never loses the rest.
  const addedDbs: Record<string, number> = {};
  let added = 0, skipped = 0;
  const d = db();
  const insertOne = async (row: Record<string, unknown>): Promise<boolean> => {
    const { error } = await d.from("papers").insert(row);
    return !error;
  };
  for (let i = 0; i < toInsert.length; i += 50) {
    const chunk = toInsert.slice(i, i + 50);
    const { error } = await d.from("papers").insert(chunk.map((x) => x.row));
    if (!error) {
      for (const x of chunk) { added++; for (const dbId of x.c.dbs) addedDbs[dbId] = (addedDbs[dbId] || 0) + 1; }
      continue;
    }
    if (/stage|found_by|title_key|pmid|external_ids|keywords|cited_by/i.test(error.message)) {
      return { ok: false, error: "The database has not been updated for this version yet: run supabase/migrate_v4.sql in the Supabase SQL editor." };
    }
    for (const x of chunk) {
      if (await insertOne(x.row)) { added++; for (const dbId of x.c.dbs) addedDbs[dbId] = (addedDbs[dbId] || 0) + 1; }
      else skipped++;
    }
  }

  // Note the search on papers that were already there.
  const updates = Array.from(toUpdate.values());
  for (let i = 0; i < updates.length; i += 8) {
    await Promise.all(updates.slice(i, i + 8).map(async ({ e, c }) => {
      const prev: any[] = Array.isArray(e.found_by) ? e.found_by : [];
      const add = c.dbs.filter((dbId) => !prev.some((f) => f && f.q === query && f.db === dbId)).map((dbId) => ({ q: query, db: dbId, at: now, id: c.ids[dbId] || null }));
      if (add.length === 0) return;
      await d.from("papers").update({ found_by: [...prev, ...add] }).eq("id", e.id);
    }));
  }

  const per: Partial<Record<Db, DbSummary>> = {};
  let pulled = 0;
  for (const r of results) {
    const dupHere = r.hits.length - (addedDbs[r.db] || 0);
    per[r.db] = { found: r.found, pulled: r.hits.length, added: addedDbs[r.db] || 0, dup: Math.max(0, dupHere), error: r.error, capped: r.capped };
    pulled += r.hits.length;
  }
  const existing = toUpdate.size + skipped;
  const errors = results.filter((r) => r.error).map((r) => r.error as string);

  // The PRISMA record: one row per search run.
  let searchId: string | null = null;
  if (pulled > 0 || errors.length < results.length) {
    const { data } = await d.from("searches").insert({
      query, dbs, year_from: input.yearFrom, year_to: input.yearTo, per_db: limit, run_by: memberId,
      results: per, pulled, added,
    }).select("id").single();
    searchId = data?.id || null;
  }
  return { ok: true, searchId, query, per, pulled, merged: cands.length, added, existing, errors };
}
