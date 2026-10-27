import Nav from "@/components/Nav";
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
  const me = await requireMember();
  const { v } = await searchParams;
  const verifiedOnly = v === "1";
  const rows = await buildDataset({ verifiedOnly });

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
    <>
      <Nav me={me} active="dataset" />
      <main>
        <h1>Step 8: Dataset</h1>
        <div className="guide-card">
          <p style={{ margin: 0 }}>
            <b>Usually Fan.</b> This page collects every row from step 6 with the paper&apos;s coding from step 5 attached. Use <b>Verified only</b> for the analysis file:
            those rows have been checked by a second person in step 7. The tables below count how papers report results by group, and the codebook at the bottom explains every column in the download.
          </p>
        </div>
        <p>
          One row per extracted effect, with the paper's final coding joined. Download the CSV for analysis in R; the codebook below defines every column.
          <Help text="Pool delta with var_delta in a three-level model clustered on paper_id (metafor rma.mv with random = ~ 1 | paper_id / effect_id, plus cluster-robust SEs). Moderators are the coding columns. Binary rows also carry rd_delta and lnrr_delta for the absolute and relative scales." />
        </p>
        <div className="row mb">
          <a className={"btn" + (!verifiedOnly ? " primary" : "")} href="/dataset">All rows ({rows.length})</a>
          <a className={"btn" + (verifiedOnly ? " primary" : "")} href="/dataset?v=1">Verified only</a>
          <a className="btn" href={`/api/dataset${verifiedOnly ? "?verified=1" : ""}`}>Download CSV</a>
        </div>

        <h2>
          Reporting audit (Research Question 3)
          <Help text="Among papers that passed full-text screening, how many report results by group, and at what level of detail. This is the audit deliverable; it is computed from the Reporting level field in each paper's final coding." />
        </h2>
        <p>{included.length} included papers, {includedCodings.length} with a coding, {papersWithEffects} with at least one extracted effect.</p>
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

        <h2>Rows</h2>
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
        {rows.length === 0 && <p>No effects extracted yet.</p>}

        <h2>Codebook</h2>
        <table className="grid">
          <thead><tr><th style={{ width: 220 }}>Column</th><th>Definition</th></tr></thead>
          <tbody>{COLUMNS.map((c) => <tr key={c.key}><td className="mono">{c.label}</td><td>{c.def}</td></tr>)}</tbody>
        </table>
      </main>
    </>
  );
}
