// Works out, for one team member, which papers are waiting on them at each step.
import { db } from "./supabase";
import { paperStatus } from "./status";
import { REPORTING_LEVELS } from "./config";
import type { Task } from "./steps";
import type { Paper, PaperStatus, Screening } from "./types";

// Reporting levels that mean the paper has numbers by group to extract.
export const EXTRACTABLE_LEVELS = REPORTING_LEVELS.slice(2);

export type Queues = {
  mine: Record<Task, string[]>;
  status: Map<string, PaperStatus>;
  counts: Record<PaperStatus, number>;
  total: number;
  noPdfFulltext: number;
  effects: number;
  verified: number;
};

export async function loadQueues(memberId: string): Promise<Queues> {
  const d = db();
  const [{ data: papers }, { data: screenings }, { data: codings }, { data: effects }] = await Promise.all([
    d.from("papers").select("id,pdf_path,abstract_override,fulltext_override,created_at").order("created_at", { ascending: true }),
    d.from("screenings").select("paper_id,member_id,stage,decision"),
    d.from("codings").select("paper_id,coder_id,reporting_level"),
    d.from("effects").select("id,paper_id,entered_by,verified_by,created_at").order("created_at", { ascending: true }),
  ]);

  const P = (papers || []) as Paper[];
  const byPaper = new Map<string, Screening[]>();
  for (const s of (screenings || []) as Screening[]) {
    if (!byPaper.has(s.paper_id)) byPaper.set(s.paper_id, []);
    byPaper.get(s.paper_id)!.push(s);
  }
  const codingsBy = new Map<string, { coder_id: string; reporting_level: string | null }[]>();
  for (const c of (codings || []) as any[]) {
    if (!codingsBy.has(c.paper_id)) codingsBy.set(c.paper_id, []);
    codingsBy.get(c.paper_id)!.push(c);
  }
  const E = (effects || []) as { id: string; paper_id: string; entered_by: string; verified_by: string | null }[];
  const effectCount = new Map<string, number>();
  for (const e of E) effectCount.set(e.paper_id, (effectCount.get(e.paper_id) || 0) + 1);

  const mine: Record<Task, string[]> = { abstract: [], fulltext: [], code: [], extract: [], verify: [] };
  const counts: Record<PaperStatus, number> = {
    abstract_pending: 0, abstract_conflict: 0, fulltext_pending: 0, fulltext_conflict: 0, included: 0, excluded: 0,
  };
  const status = new Map<string, PaperStatus>();
  const fulltextWithPdf: string[] = [];
  const fulltextNoPdf: string[] = [];
  let noPdfFulltext = 0;

  for (const p of P) {
    const scr = byPaper.get(p.id) || [];
    const st = paperStatus(p, scr);
    status.set(p.id, st);
    counts[st]++;
    const decided = (stage: string) => scr.some((s) => s.stage === stage && s.member_id === memberId);
    if (st === "abstract_pending" && !decided("abstract")) mine.abstract.push(p.id);
    if (st === "fulltext_pending") {
      if (!p.pdf_path) noPdfFulltext++;
      if (!decided("fulltext")) (p.pdf_path ? fulltextWithPdf : fulltextNoPdf).push(p.id);
    }
    if (st === "included") {
      const pc = codingsBy.get(p.id) || [];
      if (!pc.some((c) => c.coder_id === memberId) && pc.length < 2) mine.code.push(p.id);
      const extractable = pc.some((c) => c.reporting_level && EXTRACTABLE_LEVELS.includes(c.reporting_level));
      if (extractable && !effectCount.get(p.id)) mine.extract.push(p.id);
    }
  }
  mine.fulltext = [...fulltextWithPdf, ...fulltextNoPdf];

  const seen = new Set<string>();
  for (const e of E) {
    if (e.entered_by !== memberId && !e.verified_by && !seen.has(e.paper_id)) {
      seen.add(e.paper_id);
      mine.verify.push(e.paper_id);
    }
  }

  return {
    mine, status, counts, total: P.length, noPdfFulltext,
    effects: E.length, verified: E.filter((e) => e.verified_by).length,
  };
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
