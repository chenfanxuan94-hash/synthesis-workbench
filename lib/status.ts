import { VOTES_REQUIRED } from "./config";
import type { Paper, PaperStatus, Standing, Vote } from "./types";

export const STATUS_LABEL: Record<PaperStatus, string> = {
  needs_votes: "Needs votes",
  approved: "Approved",
  rejected: "Rejected",
  split: "Needs a decision",
};

// The rule, in words, for the help text and the guide.
export const RULE = `A paper is approved when ${VOTES_REQUIRED} people vote Include and nobody votes Exclude, and rejected when ${VOTES_REQUIRED} vote Exclude and nobody votes Include. Any other mix shows Needs a decision: the team talks it through and records a final decision on the paper, which overrides the votes.`;

export function standing(paper: Pick<Paper, "pi_decision">, votes: Vote[]): Standing {
  const include = votes.filter((v) => v.decision === "include").length;
  const exclude = votes.filter((v) => v.decision === "exclude").length;
  const unsure = votes.filter((v) => v.decision === "unsure").length;
  const base = { include, exclude, unsure };
  if (paper.pi_decision === "include") return { ...base, status: "approved", byPI: true };
  if (paper.pi_decision === "exclude") return { ...base, status: "rejected", byPI: true };
  if (include + exclude < VOTES_REQUIRED) return { ...base, status: "needs_votes", byPI: false };
  if (exclude === 0) return { ...base, status: "approved", byPI: false };
  if (include === 0) return { ...base, status: "rejected", byPI: false };
  return { ...base, status: "split", byPI: false };
}

// Whether this person's vote is still needed on this paper. A split paper waits for a team decision,
// so it is not pushed into anyone's queue, though anyone can still open it and vote.
export function needsMyVote(s: Standing, votes: Vote[], memberId: string): boolean {
  if (s.status !== "needs_votes") return false;
  return !votes.some((v) => v.member_id === memberId);
}

// A short sentence that explains the status, for the paper page and the table tooltip.
export function explain(s: Standing, names: string[] = []): string {
  if (s.byPI) return s.status === "approved" ? "Approved by a recorded team decision." : "Rejected by a recorded team decision.";
  const cast = s.include + s.exclude;
  if (s.status === "needs_votes") return `${cast} of ${VOTES_REQUIRED} votes so far${s.unsure ? ` (${s.unsure} not sure)` : ""}.`;
  if (s.status === "approved") return `${s.include} voted Include, nobody voted Exclude.`;
  if (s.status === "rejected") return `${s.exclude} voted Exclude, nobody voted Include.`;
  return `${s.include} voted Include and ${s.exclude} voted Exclude${names.length ? ` (${names.join(", ")})` : ""}. The team talks it through and records a decision.`;
}
