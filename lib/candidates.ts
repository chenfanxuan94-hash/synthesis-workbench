// Loads the search list (step 1): every candidate still waiting to be screened, with everyone's
// marks, plus the search log. The search page and the one-by-one screening page read this.
import { db } from "./supabase";
import { selectAll } from "./db";
import { screenStanding, needsMyScreen } from "./screening";
import type { ScreenRow } from "@/components/ScreenTable";
import type { AiScreen, FoundBy, Paper, Screen, ScreenStanding, SearchRun } from "./types";

export type CandLite = Pick<Paper, "id" | "title" | "authors" | "year" | "journal" | "doi" | "pmid" | "source" | "pdf_path" | "found_by" | "keywords" | "cited_by" | "screen_decision" | "ai_screen" | "external_ids" | "created_at">;

export type Cand = { c: CandLite; marks: Screen[]; st: ScreenStanding; mine: boolean };

export type CandList = {
  ready: boolean;
  error: string | null;
  cands: Cand[];
  searches: SearchRun[];
  counts: { total: number; pending: number; mine: number; split: number; out: number; byHand: number; ai: { likely: number; unlikely: number; unclear: number; none: number } };
  movedFromSearch: number;   // papers now in the master list that came through screening
  masterTotal: number;
};

const LITE = "id,title,authors,year,journal,doi,pmid,source,pdf_path,found_by,keywords,cited_by,screen_decision,ai_screen,external_ids,created_at";

export async function loadCandidates(memberId: string): Promise<CandList> {
  const [P, K, S, M] = await Promise.all([
    selectAll<CandLite>("papers", LITE, { order: "created_at", ascending: false, eq: ["stage", "search"] }),
    selectAll<Screen>("screens", "id,paper_id,member_id,decision,reason,updated_at", { order: "updated_at" }),
    selectAll<SearchRun>("searches", "*", { order: "run_at", ascending: false }),
    selectAll<{ id: string; screened_in_at: string | null }>("papers", "id,screened_in_at", { order: "created_at", eq: ["stage", "master"] }),
  ]);
  const empty: CandList = {
    ready: true, error: null, cands: [], searches: [],
    counts: { total: 0, pending: 0, mine: 0, split: 0, out: 0, byHand: 0, ai: { likely: 0, unlikely: 0, unclear: 0, none: 0 } },
    movedFromSearch: 0, masterTotal: 0,
  };
  const err = P.error || K.error || S.error || M.error;
  if (err) return { ...empty, ready: false, error: err };
  const marksBy = new Map<string, Screen[]>();
  for (const k of K.data) (marksBy.get(k.paper_id) || marksBy.set(k.paper_id, []).get(k.paper_id)!).push(k);
  const out: CandList = { ...empty, searches: S.data, masterTotal: M.data.length, movedFromSearch: M.data.filter((m) => m.screened_in_at).length };
  for (const c of P.data) {
    const marks = marksBy.get(c.id) || [];
    const st = screenStanding(c, marks);
    const mine = needsMyScreen(st, marks, memberId);
    out.cands.push({ c, marks, st, mine });
    out.counts.total++;
    if (st.status === "pending") out.counts.pending++;
    if (st.status === "split") out.counts.split++;
    if (st.status === "out") out.counts.out++;
    if (mine) out.counts.mine++;
    if (!Array.isArray(c.found_by) || c.found_by.length === 0) out.counts.byHand++;
    const v = (c.ai_screen as AiScreen | null)?.verdict;
    if (v === "likely" || v === "unlikely" || v === "unclear") out.counts.ai[v]++; else out.counts.ai.none++;
  }
  return out;
}

export async function abstractsFor(ids: string[]): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db().from("papers").select("id,abstract").in("id", ids.slice(i, i + 100));
    for (const r of (data || []) as { id: string; abstract: string | null }[]) map.set(r.id, r.abstract);
  }
  return map;
}

function recordUrl(c: CandLite): string | null {
  const ids = (c.external_ids || {}) as Record<string, string>;
  if (ids.eric) return `https://eric.ed.gov/?id=${ids.eric}`;
  if (ids.openalex) return `https://openalex.org/${ids.openalex}`;
  if (ids.semanticscholar) return `https://www.semanticscholar.org/paper/${ids.semanticscholar}`;
  if (c.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${c.pmid}/`;
  return null;
}

export function toRow(x: Cand, abstract: string | null): ScreenRow {
  const c = x.c;
  return {
    id: c.id, title: c.title, authors: c.authors, year: c.year, journal: c.journal, doi: c.doi, pmid: c.pmid ?? null, url: recordUrl(c),
    source: c.source, abstract, keywords: Array.isArray(c.keywords) ? c.keywords : [], found_by: (Array.isArray(c.found_by) ? c.found_by : []) as FoundBy[],
    cited_by: c.cited_by ?? null, pdf: Boolean(c.pdf_path), created_at: c.created_at, marks: x.marks, status: x.st.status, byDecision: x.st.byDecision,
    ai: (c.ai_screen as AiScreen | null) || null,
  };
}

// The next candidate for this person, oldest first so two people working at once meet on the
// same papers. `after` skips past one; `id` asks for a specific candidate.
export function pickCandidate(list: CandList, memberId: string, id?: string, after?: string): { cand: Cand | null; left: number; nextId: string | null } {
  const mine = [...list.cands].filter((x) => x.mine).sort((a, b) => (a.c.created_at < b.c.created_at ? -1 : 1));
  const left = mine.length;
  if (id) {
    const cand = list.cands.find((x) => x.c.id === id) || null;
    const i = mine.findIndex((x) => x.c.id === id);
    const nextId = mine.length ? mine[(Math.max(i, -1) + 1) % mine.length]?.c.id ?? null : null;
    return { cand, left, nextId: nextId === id ? null : nextId };
  }
  if (mine.length === 0) return { cand: null, left: 0, nextId: null };
  let idx = 0;
  if (after) {
    const i = mine.findIndex((x) => x.c.id === after);
    idx = i >= 0 ? (i + 1) % mine.length : 0;
    // `after` is usually a candidate that just left the queue, so the one that followed it is first in line.
    if (i < 0) {
      const afterAt = list.cands.find((x) => x.c.id === after)?.c.created_at;
      if (afterAt) { const j = mine.findIndex((x) => x.c.created_at > afterAt); idx = j >= 0 ? j : 0; }
    }
  }
  const cand = mine[idx];
  const nextId = mine.length > 1 ? mine[(idx + 1) % mine.length].c.id : null;
  return { cand, left, nextId };
}
