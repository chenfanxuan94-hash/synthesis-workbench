import Link from "next/link";
import Nav from "@/components/Nav";
import Help from "@/components/Help";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { paperStatus, currentStage } from "@/lib/status";
import type { Paper, Screening } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConflictsPage() {
  const me = await requireMember();
  const members = await allMembers();
  const d = db();
  const [{ data: papers }, { data: screenings }] = await Promise.all([
    d.from("papers").select("id,title,first_author,year,abstract_override,fulltext_override").order("created_at"),
    d.from("screenings").select("*"),
  ]);
  const byPaper = new Map<string, Screening[]>();
  for (const s of (screenings || []) as Screening[]) (byPaper.get(s.paper_id) || byPaper.set(s.paper_id, []).get(s.paper_id)!).push(s);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "?";

  const rows = ((papers || []) as Paper[])
    .map((p) => ({ p, scr: byPaper.get(p.id) || [], status: paperStatus(p, byPaper.get(p.id) || []) }))
    .filter((r) => r.status.endsWith("_conflict"));

  return (
    <>
      <Nav me={me} active="conflicts" />
      <main>
        <h1>Step 4: Disagreements</h1>
        <div className="guide-card">
          <ol style={{ margin: 0 }}>
            <li>These are papers where the two screeners did not agree, or one of them chose Unsure.</li>
            <li>Meet with the other screener (in person or by message). Open the paper by clicking its title.</li>
            <li>Read both decisions and notes, look at the paper together, and agree on include or exclude. Ask Fan if you cannot agree.</li>
            <li>On the paper&apos;s Screen tab, write what you agreed and why, then click <b>Agreed: include</b> or <b>Agreed: exclude</b>. The paper leaves this list.</li>
          </ol>
        </div>
        {rows.length === 0 ? <div className="note good">No disagreements right now.</div> : (
          <table className="grid">
            <thead><tr><th>Paper</th><th>Stage</th><th>Decisions</th></tr></thead>
            <tbody>
              {rows.map(({ p, scr, status }) => {
                const stage = currentStage(status)!;
                return (
                  <tr key={p.id}>
                    <td><Link href={`/papers/${p.id}`}>{p.title || "(untitled)"}</Link>{p.first_author ? ` - ${p.first_author} ${p.year ?? ""}` : ""}</td>
                    <td><span className={"pill " + status}>{stage === "abstract" ? "Abstract" : "Full text"}</span></td>
                    <td>
                      {scr.filter((s) => s.stage === stage).map((s) => (
                        <div key={s.id}><b>{nameOf(s.member_id)}: {s.decision}</b>{s.reason ? ` - ${s.reason}` : ""}{s.notes ? ` (${s.notes})` : ""}</div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
