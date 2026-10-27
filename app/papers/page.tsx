import Link from "next/link";
import Nav from "@/components/Nav";
import Help from "@/components/Help";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { paperStatus, needsMyDecision, STATUS_LABEL } from "@/lib/status";
import type { Paper, Screening, PaperStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Needs me" },
  { key: "abstract_pending", label: "Abstract stage" },
  { key: "fulltext_pending", label: "Full-text stage" },
  { key: "conflict", label: "Conflicts" },
  { key: "included", label: "Included" },
  { key: "excluded", label: "Excluded" },
];

export default async function PapersPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const me = await requireMember();
  const members = await allMembers();
  const { f = "all", q = "" } = await searchParams;
  const d = db();
  const [{ data: papers }, { data: screenings }, { data: codings }, { data: effects }] = await Promise.all([
    d.from("papers").select("id,title,authors,first_author,year,journal,doi,source,pdf_path,abstract_override,fulltext_override,created_at").order("created_at", { ascending: false }),
    d.from("screenings").select("id,paper_id,member_id,stage,decision,reason,notes,updated_at"),
    d.from("codings").select("paper_id,coder_id,is_final"),
    d.from("effects").select("paper_id,verified_by"),
  ]);
  const byPaper = new Map<string, Screening[]>();
  for (const s of (screenings || []) as Screening[]) (byPaper.get(s.paper_id) || byPaper.set(s.paper_id, []).get(s.paper_id)!).push(s);
  const codingCount = new Map<string, number>();
  for (const c of (codings || []) as any[]) codingCount.set(c.paper_id, (codingCount.get(c.paper_id) || 0) + 1);
  const effCount = new Map<string, { n: number; v: number }>();
  for (const e of (effects || []) as any[]) {
    const cur = effCount.get(e.paper_id) || { n: 0, v: 0 };
    cur.n++; if (e.verified_by) cur.v++;
    effCount.set(e.paper_id, cur);
  }
  const initials = new Map(members.map((m) => [m.id, m.initials]));
  const sym = (dcs: string) => (dcs === "include" ? "+" : dcs === "exclude" ? "x" : "?");

  const qq = q.trim().toLowerCase();
  const rows = ((papers || []) as Paper[])
    .map((p) => {
      const scr = byPaper.get(p.id) || [];
      const status = paperStatus(p, scr);
      return { p, scr, status, mine: needsMyDecision(status, scr, me.id) };
    })
    .filter((r) => {
      if (f === "mine" && !r.mine) return false;
      if (f === "conflict" && !r.status.endsWith("_conflict")) return false;
      if (["abstract_pending", "fulltext_pending", "included", "excluded"].includes(f) && r.status !== f) return false;
      if (qq) {
        const hay = `${r.p.title || ""} ${r.p.authors || ""} ${r.p.year || ""} ${r.p.doi || ""} ${r.p.journal || ""}`.toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });

  return (
    <>
      <Nav me={me} active="papers" />
      <main>
        <h1>Papers</h1>
        <div className="row mb">
          <div className="tabs" style={{ borderBottom: "none" }}>
            {FILTERS.map((x) => (
              <Link key={x.key} href={`/papers?f=${x.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={"btn" + (f === x.key ? " primary" : "")} style={{ marginRight: -1 }}>
                {x.label}
              </Link>
            ))}
          </div>
          <form method="get" className="row" style={{ marginLeft: "auto" }}>
            <input type="hidden" name="f" value={f} />
            <input type="search" name="q" defaultValue={q} placeholder="Search title, author, DOI" style={{ width: 280 }} />
            <button type="submit">Search</button>
          </form>
        </div>
        <p>{rows.length} papers</p>
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: "44%" }}>Paper</th>
              <th>Year</th>
              <th>PDF</th>
              <th>Status</th>
              <th>
                Abstract
                <Help text="Each reviewer's abstract-stage decision, shown by initials. + include, x exclude, ? unsure. Blank means not yet screened." />
              </th>
              <th>Full text</th>
              <th>Coded<Help text="Number of design-feature codings entered for the paper (one per coder). F marks that a final consensus coding exists." /></th>
              <th>Effects<Help text="Effects extracted / verified by a second person." /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, scr, status, mine }) => {
              const cc = codingCount.get(p.id) || 0;
              const hasFinal = ((codings || []) as any[]).some((c) => c.paper_id === p.id && c.is_final);
              const ec = effCount.get(p.id);
              const deco = (stage: string) =>
                scr.filter((s) => s.stage === stage).map((s) => `${initials.get(s.member_id) || "??"} ${sym(s.decision)}`).join("   ");
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/papers/${p.id}`}>{p.title || "(untitled)"}</Link>
                    <div>{p.authors ? p.authors.split(";").slice(0, 3).join(";") + (p.authors.split(";").length > 3 ? "; et al." : "") : ""}{p.journal ? ` - ${p.journal}` : ""}</div>
                  </td>
                  <td>{p.year ?? ""}</td>
                  <td>{p.pdf_path ? "yes" : ""}</td>
                  <td className="nowrap">{STATUS_LABEL[status as PaperStatus]}{mine ? <b> - needs you</b> : ""}</td>
                  <td className="nowrap">{deco("abstract")}</td>
                  <td className="nowrap">{deco("fulltext")}</td>
                  <td>{cc ? cc + (hasFinal ? " F" : "") : ""}</td>
                  <td>{ec ? `${ec.n} / ${ec.v}` : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </main>
    </>
  );
}
