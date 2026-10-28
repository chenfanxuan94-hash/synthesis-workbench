// Title-and-abstract screening (step 1). Each person marks a candidate Relevant, Not relevant or
// Unsure. The rule is deliberately generous, because the Vote step checks the full text properly:
// one Relevant mark moves the paper to the master list, unless someone marked it Not relevant,
// in which case the team records a decision.
import type { Paper, Screen, ScreenStanding, ScreenStatus } from "./types";

export const SCREEN_LABEL: Record<ScreenStatus, string> = {
  pending: "To screen",
  in: "Moved to the master list",
  out: "Screened out",
  split: "Needs a decision",
};

export const SCREEN_RULE =
  "One Relevant mark moves a candidate to the master list, where the full text is voted on. One Not relevant mark (and no Relevant) screens it out; it stays in the search list under Screened out. If one person says Relevant and another Not relevant, the candidate shows Needs a decision and anyone records the decision.";

export function screenStanding(paper: Pick<Paper, "screen_decision">, marks: Screen[]): ScreenStanding {
  const relevant = marks.filter((m) => m.decision === "relevant").length;
  const not_relevant = marks.filter((m) => m.decision === "not_relevant").length;
  const unsure = marks.filter((m) => m.decision === "unsure").length;
  const base = { relevant, not_relevant, unsure };
  if (paper.screen_decision === "in") return { ...base, status: "in", byDecision: true };
  if (paper.screen_decision === "out") return { ...base, status: "out", byDecision: true };
  if (relevant > 0 && not_relevant > 0) return { ...base, status: "split", byDecision: false };
  if (relevant > 0) return { ...base, status: "in", byDecision: false };
  if (not_relevant > 0) return { ...base, status: "out", byDecision: false };
  return { ...base, status: "pending", byDecision: false };
}

// Whether this person still has to look at the candidate.
export function needsMyScreen(s: ScreenStanding, marks: Screen[], memberId: string): boolean {
  if (s.status !== "pending") return false;
  return !marks.some((m) => m.member_id === memberId);
}

export const MARK_WORD: Record<string, string> = { relevant: "Relevant", not_relevant: "Not relevant", unsure: "Unsure" };

export function explainScreen(s: ScreenStanding, names: string[] = []): string {
  if (s.byDecision) return s.status === "in" ? "Moved to the master list by a recorded decision." : "Screened out by a recorded decision.";
  if (s.status === "pending") return s.unsure ? `${s.unsure} unsure so far; nobody has said Relevant or Not relevant.` : "Nobody has screened it yet.";
  if (s.status === "in") return `${s.relevant} said Relevant, nobody said Not relevant.`;
  if (s.status === "out") return `${s.not_relevant} said Not relevant, nobody said Relevant.`;
  return `${s.relevant} said Relevant and ${s.not_relevant} said Not relevant${names.length ? ` (${names.join(", ")})` : ""}. Anyone records the decision.`;
}

// Normalised title used to spot the same paper coming from two databases with different casing or punctuation.
export function titleKey(title: string | null | undefined): string {
  return (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 200);
}
