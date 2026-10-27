import Link from "next/link";
import Nav from "@/components/Nav";
import Help from "@/components/Help";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { paperStatus, needsMyDecision, STATUS_LABEL } from "@/lib/status";
import type { Paper, Screening, PaperStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const me = await requireMember();
  const members = await allMembers();
  const d = db();
  const [{ data: papers }, { data: screenings }, { data: codings }, { data: effects }] = await Promise.all([
    d.from("papers").select("id,title,first_author,year,abstract_override,fulltext_override,created_at").order("created_at", { ascending: false }),
    d.from("screenings").select("paper_id,member_id,stage,decision"),
    d.from("codings").select("paper_id,coder_id,is_final"),
    d.from("effects").select("id,paper_id,verified_by"),
  ]);
  const P = (papers || []) as Paper[];
  const S = (screenings || []) as Screening[];
  const byPaper = new Map<string, Screening[]>();
  for (const s of S) (byPaper.get(s.paper_id) || byPaper.set(s.paper_id, []).get(s.paper_id)!).push(s);

  const counts: Record<PaperStatus, number> = {
    abstract_pending: 0, abstract_conflict: 0, fulltext_pending: 0, fulltext_conflict: 0, included: 0, excluded: 0,
  };
  const queue: { paper: Paper; stage: string }[] = [];
  const includedIds: string[] = [];
  for (const p of P) {
    const st = paperStatus(p, byPaper.get(p.id) || []);
    counts[st]++;
    if (st === "included") includedIds.push(p.id);
    const stage = needsMyDecision(st, byPaper.get(p.id) || [], me.id);
    if (stage) queue.push({ paper: p, stage });
  }
  const codedPapers = new Set((codings || []).map((c: any) => c.paper_id));
  const includedNotCoded = includedIds.filter((id) => !codedPapers.has(id)).length;
  const E = (effects || []) as { id: string; paper_id: string; verified_by: string | null }[];
  const verified = E.filter((e) => e.verified_by).length;
  const papersWithEffects = new Set(E.map((e) => e.paper_id)).size;

  return (
    <>
      <Nav me={me} active="home" />
      <main>
        <h1>Dashboard</h1>
        <div className="kpi">
          <div className="box"><b>{P.length}</b>papers in the library</div>
          <div className="box"><b>{counts.abstract_pending}</b>awaiting abstract screening</div>
          <div className="box"><b>{counts.fulltext_pending}</b>awaiting full-text screening</div>
          <div className="box"><b>{counts.abstract_conflict + counts.fulltext_conflict}</b>{" "}
            <Link href="/conflicts">conflicts to resolve</Link></div>
          <div className="box"><b>{counts.included}</b>included</div>
          <div className="box"><b>{counts.excluded}</b>excluded</div>
          <div className="box"><b>{includedNotCoded}</b>included, not yet coded</div>
          <div className="box"><b>{E.length}</b>effects extracted ({verified} verified, {papersWithEffects} papers)</div>
        </div>

        <h2>
          Your queue
          <Help text="Papers at a screening stage where you have not yet entered a decision. Each paper needs two independent decisions per stage. Your decision is hidden from the others until they have entered theirs, and theirs from you." />
        </h2>
        {queue.length === 0 ? (
          <p>Nothing waiting on you.</p>
        ) : (
          <table className="grid">
            <thead><tr><th>Paper</th><th>Year</th><th>Stage</th></tr></thead>
            <tbody>
              {queue.slice(0, 50).map(({ paper, stage }) => (
                <tr key={paper.id}>
                  <td><Link href={`/papers/${paper.id}`}>{paper.title || "(untitled)"}</Link>{paper.first_author ? ` - ${paper.first_author}` : ""}</td>
                  <td>{paper.year ?? ""}</td>
                  <td>{stage === "abstract" ? "Abstract" : "Full text"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {queue.length > 50 && <p className="mt">Showing 50 of {queue.length}. The full list is under Papers with the filter "needs me".</p>}

        <h2>Team</h2>
        <table className="grid" style={{ maxWidth: 560 }}>
          <thead><tr><th>Member</th><th>Screenings</th><th>Codings</th><th>Effects entered</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{S.filter((s) => s.member_id === m.id).length}</td>
                <td>{(codings || []).filter((c: any) => c.coder_id === m.id).length}</td>
                <td>{E.filter((e: any) => e.entered_by === m.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt">Pipeline: {Object.entries(counts).map(([k, v]) => `${STATUS_LABEL[k as PaperStatus]}: ${v}`).join("  |  ")}</p>
      </main>
    </>
  );
}
