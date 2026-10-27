import Link from "next/link";
import Back from "@/components/Back";
import Help from "@/components/Help";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { paperStatus, needsMyDecision, STATUS_LABEL } from "@/lib/status";
import type { Paper, Screening, PaperStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All papers" },
  { key: "mine", label: "Waiting for me" },
  { key: "abstract_pending", label: "At the abstract step" },
  { key: "fulltext_pending", label: "At the full-text step" },
  { key: "conflict", label: "Disagreements" },
  { key: "included", label: "Included" },
  { key: "excluded", label: "Excluded" },
];

export default async function PapersPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; d?: string }> }) {
  const me = await requireMember();
  const members = await allMembers();
  const { f = "all", q = "", d: more } = await searchParams;
  const details = more === "1";
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

  const toggle = `/papers?f=${encodeURIComponent(f)}${q ? `&q=${encodeURIComponent(q)}` : ""}${details ? "" : "&d=1"}`;

  return (
    <main className="center wide">
      <Back />
      <h1>All papers</h1>
      <form method="get" className="toolbar">
        <input type="search" name="q" defaultValue={q} placeholder="Search by title, author, or DOI" />
        <select name="f" defaultValue={f}>
          {FILTERS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        {details && <input type="hidden" name="d" value="1" />}
        <button type="submit" className="primary">Show</button>
      </form>
      <p className="muted">
        {rows.length} {rows.length === 1 ? "paper" : "papers"}. Click a title to open it. <Link href={toggle}>{details ? "Show fewer columns" : "Show more columns"}</Link>
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th style={{ width: details ? "38%" : "62%" }}>Paper</th>
            <th>Status</th>
            <th>PDF</th>
            {details && (
              <>
                <th>
                  Abstract
                  <Help text="Each reviewer's abstract-stage decision, shown by initials. + include, x exclude, ? unsure. Until you have saved your own decision, other people's decisions show only as done, so screening stays independent." />
                </th>
                <th>Full text</th>
                <th>Coded<Help text="Number of design-feature codings entered for the paper (one per coder). F marks that a final consensus coding exists." /></th>
                <th>Effects<Help text="Effects extracted / verified by a second person." /></th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, scr, status, mine }) => {
            const cc = codingCount.get(p.id) || 0;
            const hasFinal = ((codings || []) as any[]).some((c) => c.paper_id === p.id && c.is_final);
            const ec = effCount.get(p.id);
            // Others' decisions stay hidden until you have saved your own at that stage.
            const deco = (stage: string) => {
              const rs = scr.filter((s) => s.stage === stage);
              const iDecided = rs.some((s) => s.member_id === me.id);
              return rs
                .map((s) => `${initials.get(s.member_id) || "??"} ${iDecided || s.member_id === me.id ? sym(s.decision) : "done"}`)
                .join("   ");
            };
            const authors = p.authors ? p.authors.split(";").slice(0, 3).join(";") + (p.authors.split(";").length > 3 ? "; et al." : "") : "";
            return (
              <tr key={p.id}>
                <td>
                  <Link href={`/papers/${p.id}`} className="paperlink">{p.title || "(untitled)"}</Link>
                  <div className="sub">{[authors, p.journal, p.year].filter(Boolean).join(" - ")}</div>
                </td>
                <td className="nowrap"><span className={"pill " + status}>{STATUS_LABEL[status as PaperStatus]}</span>{mine ? <> <span className="pill you">needs you</span></> : ""}</td>
                <td>{p.pdf_path ? <>&#10003;</> : <span className="muted">none</span>}</td>
                {details && (
                  <>
                    <td className="nowrap">{deco("abstract")}</td>
                    <td className="nowrap">{deco("fulltext")}</td>
                    <td>{cc ? cc + (hasFinal ? " F" : "") : ""}</td>
                    <td>{ec ? `${ec.n} / ${ec.v}` : ""}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted mt">No papers match.</p>}
    </main>
  );
}
