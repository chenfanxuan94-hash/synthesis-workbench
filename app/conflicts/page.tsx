import Link from "next/link";
import Back from "@/components/Back";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { paperStatus, currentStage } from "@/lib/status";
import type { Paper, Screening } from "@/lib/types";

export const dynamic = "force-dynamic";

const label = (d: string) => (d === "include" ? "Include" : d === "exclude" ? "Exclude" : "Unsure");

export default async function ConflictsPage() {
  await requireMember();
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
    <main className="center">
      <Back />
      <div className="eyebrow">Step 4</div>
      <h1>Disagreements</h1>
      <p className="lead">
        The two screeners did not agree on these papers. Meet, read both reasons, agree on include or exclude, and record it on the paper.
      </p>
      {rows.length === 0 ? (
        <div className="allclear">No disagreements right now.</div>
      ) : (
        rows.map(({ p, scr, status }) => {
          const stage = currentStage(status)!;
          return (
            <div className="item" key={p.id}>
              <div className="eyebrow">{stage === "abstract" ? "Abstract step" : "Full-text step"}</div>
              <div className="t">{p.title || "(untitled)"}</div>
              <div className="sub">{p.first_author ? `${p.first_author} ${p.year ?? ""}` : ""}</div>
              <div className="who">
                {scr.filter((s) => s.stage === stage).map((s) => (
                  <div key={s.id}>
                    <b>{nameOf(s.member_id)}: {label(s.decision)}</b>
                    {s.reason ? ` - ${s.reason}` : ""}
                    {s.notes ? <span className="muted"> ({s.notes})</span> : null}
                  </div>
                ))}
              </div>
              <Link className="btn primary" href={`/papers/${p.id}`}>Open and decide &rarr;</Link>
            </div>
          );
        })
      )}
    </main>
  );
}
