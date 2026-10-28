import type { Member, Screen } from "@/lib/types";

// One small chip per team member: green Relevant, red Not relevant, amber Unsure, grey not yet.
export default function ScreenChips({ members, marks }: { members: Member[]; marks: Screen[] }) {
  return (
    <span className="vchips">
      {members.map((m) => {
        const k = marks.find((x) => x.member_id === m.id);
        const cls = !k ? "none" : k.decision === "relevant" ? "include" : k.decision === "not_relevant" ? "exclude" : "unsure";
        const word = !k ? "has not screened it" : k.decision === "relevant" ? "Relevant" : k.decision === "not_relevant" ? "Not relevant" : "Unsure";
        const title = `${m.name}: ${word}${k?.reason ? ` (${k.reason})` : ""}`;
        return (
          <span key={m.id} className={"vchip " + cls} title={title} aria-label={title}>
            {m.initials}
          </span>
        );
      })}
    </span>
  );
}
