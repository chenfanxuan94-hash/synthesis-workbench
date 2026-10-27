import { SCREENERS_REQUIRED } from "./config";
import type { Paper, PaperStatus, Screening, Stage } from "./types";

export const STATUS_LABEL: Record<PaperStatus, string> = {
  abstract_pending: "Step 2: abstract screening",
  abstract_conflict: "Step 4: disagreement (abstract)",
  fulltext_pending: "Step 3: full-text screening",
  fulltext_conflict: "Step 4: disagreement (full text)",
  included: "Included",
  excluded: "Excluded",
};

function stageOutcome(
  override: "include" | "exclude" | null,
  rows: Screening[]
): "pass" | "exclude" | "conflict" | "pending" {
  if (override === "include") return "pass";
  if (override === "exclude") return "exclude";
  if (rows.length < SCREENERS_REQUIRED) return "pending";
  if (rows.every((s) => s.decision === "include")) return "pass";
  if (rows.every((s) => s.decision === "exclude")) return "exclude";
  return "conflict";
}

export function paperStatus(paper: Paper, screenings: Screening[]): PaperStatus {
  const abs = screenings.filter((s) => s.stage === "abstract");
  const a = stageOutcome(paper.abstract_override, abs);
  if (a === "pending") return "abstract_pending";
  if (a === "conflict") return "abstract_conflict";
  if (a === "exclude") return "excluded";
  const ft = screenings.filter((s) => s.stage === "fulltext");
  const f = stageOutcome(paper.fulltext_override, ft);
  if (f === "pending") return "fulltext_pending";
  if (f === "conflict") return "fulltext_conflict";
  if (f === "exclude") return "excluded";
  return "included";
}

export function currentStage(status: PaperStatus): Stage | null {
  if (status === "abstract_pending" || status === "abstract_conflict") return "abstract";
  if (status === "fulltext_pending" || status === "fulltext_conflict") return "fulltext";
  return null;
}

export function needsMyDecision(status: PaperStatus, screenings: Screening[], memberId: string): Stage | null {
  const stage = currentStage(status);
  if (!stage) return null;
  if (status.endsWith("_conflict")) return null;
  const mine = screenings.find((s) => s.stage === stage && s.member_id === memberId);
  return mine ? null : stage;
}
