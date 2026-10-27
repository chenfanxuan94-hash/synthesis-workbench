import type { Member, Vote } from "@/lib/types";

// One small chip per team member: green Include, red Exclude, amber Not sure, grey not voted.
// With `blind`, other people's decisions are shown only as "voted" until you have voted yourself.
export default function VoteChips({ members, votes, meId, blind = false }: { members: Member[]; votes: Vote[]; meId: string; blind?: boolean }) {
  const iVoted = votes.some((v) => v.member_id === meId);
  return (
    <span className="vchips">
      {members.map((m) => {
        const v = votes.find((x) => x.member_id === m.id);
        const hidden = blind && v && !iVoted && m.id !== meId;
        const cls = !v ? "none" : hidden ? "cast" : v.decision;
        const word = !v ? "has not voted" : hidden ? "voted" : v.decision === "include" ? "Include" : v.decision === "exclude" ? "Exclude" : "Not sure";
        const title = `${m.name}: ${word}${v && !hidden && v.reason ? ` (${v.reason})` : ""}${v && !hidden && v.notes ? ` - ${v.notes}` : ""}`;
        return (
          <span key={m.id} className={"vchip " + cls} title={title} aria-label={title}>
            {m.initials}
          </span>
        );
      })}
    </span>
  );
}
