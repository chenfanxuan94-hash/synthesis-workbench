import Back from "@/components/Back";
import Help from "@/components/Help";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { loadQueues } from "@/lib/queue";

export const dynamic = "force-dynamic";

// Where every paper is, and what each person has done. Kept off Home so Home stays simple.
export default async function ProgressPage() {
  const me = await requireMember();
  const members = await allMembers();
  const q = await loadQueues(me.id);
  const d = db();
  const [{ data: screenings }, { data: codings }, { data: effects }] = await Promise.all([
    d.from("screenings").select("member_id"),
    d.from("codings").select("coder_id"),
    d.from("effects").select("entered_by,verified_by"),
  ]);
  const conflicts = q.counts.abstract_conflict + q.counts.fulltext_conflict;
  const total = Math.max(q.total, 1);
  const seg = [
    { k: "abstract_pending", v: q.counts.abstract_pending, l: "Abstract screening" },
    { k: "fulltext_pending", v: q.counts.fulltext_pending, l: "Full-text screening" },
    { k: "conflict", v: conflicts, l: "Disagreements" },
    { k: "included", v: q.counts.included, l: "Included" },
    { k: "excluded", v: q.counts.excluded, l: "Excluded" },
  ];

  return (
    <main className="center wide">
      <Back />
      <h1>Team progress</h1>
      <p className="lead">{q.total} {q.total === 1 ? "paper" : "papers"} in the library.</p>

      <h2>
        Where the papers are
        <Help text="Every paper in the library, colored by the step it is at. Papers move from left to right as the team works." />
      </h2>
      <div className="pipe">
        {seg.filter((x) => x.v > 0).map((x) => (
          <div key={x.k} className={x.k} style={{ width: `${(100 * x.v) / total}%` }} title={`${x.l}: ${x.v}`} />
        ))}
      </div>
      <div className="legend">
        {seg.map((x) => <span key={x.k} className={x.k}>{x.l}: <b>{x.v}</b></span>)}
      </div>

      <h2>What each person has done</h2>
      <table className="grid">
        <thead><tr><th>Member</th><th>Screening decisions</th><th>Papers coded</th><th>Rows entered</th><th>Rows checked</th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <td><b>{m.name}</b>{m.id === me.id ? " (you)" : ""}</td>
              <td>{(screenings || []).filter((s: any) => s.member_id === m.id).length}</td>
              <td>{(codings || []).filter((c: any) => c.coder_id === m.id).length}</td>
              <td>{(effects || []).filter((e: any) => e.entered_by === m.id).length}</td>
              <td>{(effects || []).filter((e: any) => e.verified_by === m.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
