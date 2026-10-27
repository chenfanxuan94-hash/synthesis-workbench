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
        <h1>
          Conflicts
          <Help text="Papers where the reviewers disagreed, or someone marked unsure, at the current stage. Open the paper to see both views side by side and record the agreed decision. Resolved conflicts leave this list." />
        </h1>
        {rows.length === 0 ? <p>No open conflicts.</p> : (
          <table className="grid">
            <thead><tr><th>Paper</th><th>Stage</th><th>Decisions</th></tr></thead>
            <tbody>
              {rows.map(({ p, scr, status }) => {
                const stage = currentStage(status)!;
                return (
                  <tr key={p.id}>
                    <td><Link href={`/papers/${p.id}`}>{p.title || "(untitled)"}</Link>{p.first_author ? ` - ${p.first_author} ${p.year ?? ""}` : ""}</td>
                    <td>{stage === "abstract" ? "Abstract" : "Full text"}</td>
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
