import Back from "@/components/Back";
import Help from "@/components/Help";
import { db } from "@/lib/supabase";
import { requireMember } from "@/lib/session";
import { buildDataset, COLUMNS } from "@/lib/dataset";
import { paperStatus } from "@/lib/status";
import { OUTCOME_FAMILIES, GROUP_DIMENSIONS } from "@/lib/config";
import type { Coding, Paper, Screening } from "@/lib/types";

export const dynamic = "force-dynamic";

const SHOW = ["study", "outcome_family", "outcome_name", "timepoint", "group_dimension", "tier", "g_m", "g_c", "delta", "var_delta", "rd_delta", "lnrr_delta", "targeting_level", "cultural_adaptation", "delivery_agent", "verified_by"];

function count<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it) || "(blank)"; m.set(k, (m.get(k) || 0) + 1); }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

export default async function DatasetPage({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  await requireMember();
  const { v } = await searchParams;
  const verifiedOnly = v === "1";
  const all = await buildDataset({ verifiedOnly: false });
  const verifiedCount = all.filter((r) => r.verified_by).length;
  const rows = verifiedOnly ? all.filter((r) => r.verified_by) : all;

  const d = db();
  const [{ data: papers }, { data: screenings }, { data: codings }] = await Promise.all([
    d.from("papers").select("id,abstract_override,fulltext_override"),
    d.from("screenings").select("paper_id,member_id,stage,decision"),
    d.from("codings").select("*"),
  ]);
  const byPaper = new Map<string, Screening[]>();
  for (const s of (screenings || []) as Screening[]) (byPaper.get(s.paper_id) || byPaper.set(s.paper_id, []).get(s.paper_id)!).push(s);
  const included = ((papers || []) as Paper[]).filter((p) => paperStatus(p, byPaper.get(p.id) || []) === "included");
  const finalCoding = new Map<string, Coding>();
  for (const c of (codings || []) as Coding[]) {
    const cur = finalCoding.get(c.paper_id);
    if (!cur || (c.is_final && !cur.is_final)) finalCoding.set(c.paper_id, c);
  }
  const includedCodings = included.map((p) => finalCoding.get(p.id)).filter(Boolean) as Coding[];
  const papersWithEffects = new Set(rows.map((r) => r.paper_id)).size;

  const fmt = (x: unknown) => (typeof x === "number" ? x.toFixed(3) : x === null || x === undefined ? "" : String(x));

  return (
    <main className="center wide">
      <Back />
      <div className="eyebrow">Step 8</div>
      <h1>Download the dataset</h1>
      <p className="lead">
        {rows.length} {rows.length === 1 ? "row" : "rows"} from {papersWithEffects} {papersWithEffects === 1 ? "paper" : "papers"}.
        {" "}{verifiedCount} {verifiedCount === 1 ? "row has" : "rows have"} been checked by a second person.
      </p>

      <div className="mb">
        <div className="seg2">
          <a className={!verifiedOnly ? "on" : ""} href="/dataset">All rows ({all.length})</a>
          <a className={verifiedOnly ? "on" : ""} href="/dataset?v=1">Verified only ({verifiedCount})</a>
        </div>
      </div>
      <a className="btn primary big" href={`/api/dataset${verifiedOnly ? "?verified=1" : ""}`}>
        Download CSV{verifiedOnly ? " (verified rows only)" : ""}
      </a>
      <p className="muted mt">
        Use <b>Verified only</b> for the analysis file. One row per extracted effect, with the paper&apos;s final coding attached.
        <Help text="Pool delta with var_delta in a three-level model clustered on paper_id (metafor rma.mv with random = ~ 1 | paper_id / effect_id, plus cluster-robust SEs). Moderators are the coding columns. Binary rows also carry rd_delta and lnrr_delta for the absolute and relative scales." />
      </p>

      <details className="fold">
        <summary>Reporting audit</summary>
        <p className="muted">
          {included.length} included papers, {includedCodings.length} with a coding, {papersWithEffects} with at least one extracted effect.
          <Help text="Among papers that passed full-text screening, how many report results by group, and at what level of detail. Computed from the Reporting level field in each paper's final coding." />
        </p>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <table className="grid" style={{ width: "auto", minWidth: 420 }}>
            <thead><tr><th>Reporting level (final coding)</th><th>Papers</th></tr></thead>
            <tbody>{count(includedCodings, (c) => c.reporting_level || "").map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody>
          </table>
          <table className="grid" style={{ width: "auto", minWidth: 300 }}>
            <thead><tr><th>Single-group samples</th><th>Papers</th></tr></thead>
            <tbody>{count(includedCodings, (c) => c.single_group_sample === true ? "Yes" : c.single_group_sample === false ? "No" : "").map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody>
          </table>
          <table className="grid" style={{ width: "auto", minWidth: 300 }}>
            <thead><tr><th>Effects by outcome family</th><th>Rows</th></tr></thead>
            <tbody>{count(rows, (r) => OUTCOME_FAMILIES[String(r.outcome_family)] || "").map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody>
          </table>
          <table className="grid" style={{ width: "auto", minWidth: 300 }}>
            <thead><tr><th>Effects by group contrast</th><th>Rows</th></tr></thead>
            <tbody>{count(rows, (r) => GROUP_DIMENSIONS[String(r.group_dimension)] || "").map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody>
          </table>
          <table className="grid" style={{ width: "auto", minWidth: 240 }}>
            <thead><tr><th>Effects by tier</th><th>Rows</th></tr></thead>
            <tbody>{count(rows, (r) => String(r.tier || "")).map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody>
          </table>
        </div>
      </details>

      <details className="fold">
        <summary>Preview the rows</summary>
        {rows.length === 0 ? <p className="muted">No effects extracted yet.</p> : (
          <div className="dataset-wrap">
            <table className="grid">
              <thead><tr>{SHOW.map((k) => <th key={k}>{k}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.effect_id)}>{SHOW.map((k) => <td key={k}>{fmt(r[k])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details className="fold">
        <summary>What each column means (codebook)</summary>
        <table className="grid">
          <thead><tr><th style={{ width: 220 }}>Column</th><th>Definition</th></tr></thead>
          <tbody>{COLUMNS.map((c) => <tr key={c.key}><td className="mono">{c.label}</td><td>{c.def}</td></tr>)}</tbody>
        </table>
      </details>
    </main>
  );
}
