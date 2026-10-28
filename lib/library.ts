// Loads the whole library once and works out, for one team member, where every paper
// stands and what is waiting on them. Home, the master list and the task pages read this.
import { selectAll } from "./db";
import { standing, needsMyVote } from "./status";
import { screenStanding, needsMyScreen } from "./screening";
import type { Task } from "./steps";
import type { Paper, PaperStatus, Screen, Standing, Vote } from "./types";

export type CodingSummary = { done: boolean; updated_by: string | null; coder_id: string; updated_at: string };
export type LastTouch = { member_id: string | null; what: string; at: string };

export type Row = {
  paper: Paper;
  votes: Vote[];
  standing: Standing;
  needsMe: boolean;
  coding: CodingSummary | null;
  effects: number;
  last: LastTouch | null;
};

// Step 1 in numbers: the candidates still in the search list.
export type Screening = { total: number; pending: number; mine: number; split: number; out: number };

export type Library = {
  ready: boolean;
  error: string | null;
  rows: Row[];
  byId: Map<string, Row>;
  mine: Record<Task, string[]>;
  counts: Record<PaperStatus, number>;
  total: number;
  waitingOthers: number;   // papers I voted on that still need another vote
  split: number;           // papers waiting for a team decision
  approvedNotDone: number;
  effects: number;
  sources: string[];
  screening: Screening;
};

type EffectLite = { id: string; paper_id: string; entered_by: string; updated_by: string | null; updated_at: string; created_at: string };

export async function loadLibrary(memberId: string): Promise<Library> {
  const [P, V, C, E, S, K] = await Promise.all([
    selectAll<Paper>("papers", "id,title,authors,first_author,year,journal,doi,source,pdf_path,pi_decision,pi_note,pi_by,pi_at,added_by,created_at,updated_at,stage,found_by,screened_in_at", { order: "created_at", ascending: false, eq: ["stage", "master"] }),
    selectAll<Vote>("votes", "id,paper_id,member_id,decision,reason,notes,updated_at", { order: "updated_at" }),
    selectAll<CodingSummary & { paper_id: string }>("codings", "paper_id,coder_id,updated_by,done,updated_at", { order: "updated_at" }),
    selectAll<EffectLite>("effects", "id,paper_id,entered_by,updated_by,updated_at,created_at", { order: "created_at" }),
    selectAll<{ id: string; screen_decision: "in" | "out" | null; created_at: string }>("papers", "id,screen_decision,created_at", { order: "created_at", eq: ["stage", "search"] }),
    selectAll<Screen>("screens", "id,paper_id,member_id,decision,reason,updated_at", { order: "updated_at" }),
  ]);

  const empty: Library = {
    ready: true, error: null, rows: [], byId: new Map(), mine: { screen: [], vote: [], code: [] },
    counts: { needs_votes: 0, approved: 0, rejected: 0, split: 0 },
    total: 0, waitingOthers: 0, split: 0, approvedNotDone: 0, effects: 0, sources: [],
    screening: { total: 0, pending: 0, mine: 0, split: 0, out: 0 },
  };
  const err = V.error || P.error || C.error || E.error || S.error || K.error;
  if (err) return { ...empty, ready: false, error: err };

  // Step 1: where the search list stands, and which candidates still wait for this person.
  const marksBy = new Map<string, Screen[]>();
  for (const k of K.data) (marksBy.get(k.paper_id) || marksBy.set(k.paper_id, []).get(k.paper_id)!).push(k);
  const screening = { total: S.data.length, pending: 0, mine: 0, split: 0, out: 0 };
  const mineScreen: string[] = [];
  for (const c of S.data) {
    const st = screenStanding(c, marksBy.get(c.id) || []);
    if (st.status === "pending") screening.pending++;
    if (st.status === "split") screening.split++;
    if (st.status === "out") screening.out++;
    if (needsMyScreen(st, marksBy.get(c.id) || [], memberId)) { screening.mine++; mineScreen.push(c.id); }
  }
  empty.screening = screening;
  empty.mine.screen = mineScreen;

  const votesBy = new Map<string, Vote[]>();
  for (const v of V.data) (votesBy.get(v.paper_id) || votesBy.set(v.paper_id, []).get(v.paper_id)!).push(v);
  const codingBy = new Map<string, CodingSummary>();
  for (const c of C.data) {
    // One shared coding per paper. If an older version left two, the latest saved one counts.
    const cur = codingBy.get(c.paper_id);
    if (!cur || c.updated_at > cur.updated_at || (c.done && !cur.done)) codingBy.set(c.paper_id, c);
  }
  const effectsBy = new Map<string, EffectLite[]>();
  for (const e of E.data) (effectsBy.get(e.paper_id) || effectsBy.set(e.paper_id, []).get(e.paper_id)!).push(e);

  const lib: Library = { ...empty, total: P.data.length, effects: E.data.length };
  const sources = new Set<string>();

  // Papers that need a vote come first in the voting queue in the order they were added,
  // so two people working at once tend to meet on the same papers.
  const oldestFirst = [...P.data].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

  for (const p of P.data) {
    const votes = votesBy.get(p.id) || [];
    const s = standing(p, votes);
    const coding = codingBy.get(p.id) || null;
    const effs = effectsBy.get(p.id) || [];
    const needsMe = needsMyVote(s, votes, memberId);
    lib.counts[s.status]++;
    if (p.source) sources.add(p.source);
    if (s.status === "needs_votes" && !needsMe && votes.some((v) => v.member_id === memberId)) lib.waitingOthers++;
    if (s.status === "split") lib.split++;
    if (s.status === "approved" && !coding?.done) lib.approvedNotDone++;

    // Who touched this paper last: the latest of the votes, the coding, the effect rows, or adding it.
    let last: LastTouch | null = p.added_by || p.created_at ? { member_id: p.added_by, what: "added", at: p.created_at } : null;
    const bump = (member_id: string | null, what: string, at: string | null | undefined) => {
      if (!at) return;
      if (!last || at > last.at) last = { member_id, what, at };
    };
    for (const v of votes) bump(v.member_id, "voted", v.updated_at);
    if (coding) bump(coding.updated_by || coding.coder_id, coding.done ? "marked done" : "coded features", coding.updated_at);
    for (const e of effs) bump(e.updated_by || e.entered_by, "edited effect rows", e.updated_at || e.created_at);
    if (p.pi_decision && p.pi_at) bump(p.pi_by, "decided", p.pi_at);

    const row: Row = { paper: p, votes, standing: s, needsMe, coding, effects: effs.length, last };
    lib.rows.push(row);
    lib.byId.set(p.id, row);
  }
  for (const p of oldestFirst) {
    const r = lib.byId.get(p.id)!;
    if (r.needsMe) lib.mine.vote.push(p.id);
    if (r.standing.status === "approved" && !r.coding?.done) lib.mine.code.push(p.id);
  }
  lib.sources = Array.from(sources).sort();
  return lib;
}

// Next paper in a queue. With `after`, moves past that paper (used for Skip and Next).
export function pickNext(list: string[], after?: string): string | null {
  if (list.length === 0) return null;
  if (!after) return list[0];
  const i = list.indexOf(after);
  if (i < 0) return list[0];
  if (list.length === 1) return list[0];
  return list[(i + 1) % list.length];
}
