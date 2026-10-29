// The keyword bank (step 1): every query the team has run, what it produced, and how many of
// its candidates came through screening, plus the single terms used so far and the shared list
// of keywords still to try. Everything is worked out from the search log and the papers; nothing
// here is stored except the ideas themselves.
import type { FoundBy, SearchRun } from "./types";

export type KeywordIdea = { id: string; text: string; note: string | null; added_by: string | null; created_at: string };

// One row of the bank: one distinct query (case and spacing ignored).
export type BankRow = {
  query: string;            // as last typed
  key: string;              // normalised form, for matching
  runs: number;
  dbs: string[];            // every database it was sent to, across runs
  lastAt: string;
  lastBy: string | null;
  found: number;            // records the databases reported on the latest run, summed
  perDb: Record<string, { found: number; error: string | null }>;   // each database's own count on the latest run
  pulled: number;           // records retrieved across runs
  added: number;            // new candidates it brought in across runs
  inList: number;           // its candidates still in the search list
  out: number;              // of those, screened out
  moved: number;            // its candidates now in the master list
  errors: number;           // database failures across runs
};

export type TermCount = { term: string; queries: number };

// Lower case, straight quotes, one space: "School AND  Mental" and "school and mental" are the same query.
export function normalizeQuery(q: string): string {
  return (q || "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .toLowerCase().replace(/\s+/g, " ").trim();
}

const OPERATORS = new Set(["and", "or", "not", "near", "adj"]);

// The words and quoted phrases in a query, without operators, brackets and field tags.
export function termsOf(q: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const s = normalizeQuery(q).replace(/\[[^\]]*\]/g, " ");
  const re = /"([^"]+)"|([a-z0-9][a-z0-9*'-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const t = (m[1] || m[2] || "").trim();
    if (!t || OPERATORS.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

type CandLike = { found_by?: FoundBy[] | null; stage?: "search" | "master"; status?: "pending" | "in" | "out" | "split" };

export function buildBank(searches: SearchRun[], papers: CandLike[]): { rows: BankRow[]; terms: TermCount[] } {
  const rows = new Map<string, BankRow>();
  // Oldest first so "query" ends up as the most recently typed spelling.
  const runs = [...searches].sort((a, b) => (a.run_at < b.run_at ? -1 : 1));
  for (const s of runs) {
    const key = normalizeQuery(s.query);
    if (!key) continue;
    const per = s.results || {};
    const found = Object.values(per).reduce((n, r) => n + (r?.found || 0), 0);
    const errors = Object.values(per).filter((r) => r?.error).length;
    const cur = rows.get(key) || { query: s.query, key, runs: 0, dbs: [], lastAt: s.run_at, lastBy: s.run_by, found: 0, perDb: {}, pulled: 0, added: 0, inList: 0, out: 0, moved: 0, errors: 0 };
    cur.query = s.query;
    cur.runs++;
    for (const d of s.dbs || []) if (!cur.dbs.includes(d)) cur.dbs.push(d);
    cur.lastAt = s.run_at;
    cur.lastBy = s.run_by;
    cur.found = found;
    cur.perDb = {};
    for (const d of s.dbs || []) { const r = per[d]; cur.perDb[d] = { found: r?.found || 0, error: r?.error || (r ? null : "no answer") }; }
    cur.pulled += s.pulled || 0;
    cur.added += s.added || 0;
    cur.errors += errors;
    rows.set(key, cur);
  }
  // What became of the candidates each query brought in (a paper found by two queries counts for both).
  for (const p of papers) {
    const keys = new Set((Array.isArray(p.found_by) ? p.found_by : []).map((f) => normalizeQuery(f.q)));
    for (const k of keys) {
      const row = rows.get(k);
      if (!row) continue;
      if (p.stage === "master") row.moved++;
      else { row.inList++; if (p.status === "out") row.out++; }
    }
  }
  const list = Array.from(rows.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  const termMap = new Map<string, number>();
  for (const r of list) for (const t of termsOf(r.query)) termMap.set(t, (termMap.get(t) || 0) + 1);
  const terms = Array.from(termMap.entries()).map(([term, queries]) => ({ term, queries })).sort((a, b) => b.queries - a.queries || a.term.localeCompare(b.term));
  return { rows: list, terms };
}

// An idea is done once a search with the same text has run.
export function ideaDone(idea: KeywordIdea, bank: BankRow[]): BankRow | null {
  const k = normalizeQuery(idea.text);
  return bank.find((r) => r.key === k) || null;
}
