import Back from "@/components/Back";
import Help from "@/components/Help";
import { requireMember } from "@/lib/session";
import { buildDataset, COLUMNS } from "@/lib/dataset";
import { OUTCOME_FAMILIES, GROUP_DIMENSIONS } from "@/lib/config";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SHOW = ["study", "outcome_family", "outcome_name", "timepoint", "group_dimension", "tier", "g_m", "g_c", "delta", "var_delta", "rd_delta", "lnrr_delta", "targeting_level", "cultural_adaptation", "delivery_agent", "coding_done", "last_edited_by"];

function count<T>(items: T[], key: (t: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const it of items) { const k = key(it) || "(blank)"; m.set(k, (m.get(k) || 0) + 1); }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

export default async function DatasetPage() {
  await requireMember();
  const ds = await buildDataset();
  const rows = ds.rows;
  const fmt = (x: unknown) => (typeof x === "number" ? x.toFixed(3) : x === null || x === undefined ? "" : typeof x === "boolean" ? (x ? "yes" : "no") : String(x));
  const unfinished = ds.approvedPapers - ds.approvedDone;

  return (
    <main className="center wide">
      <Back />
      <div className="eyebrow">Step 4</div>
      <h1>Download the dataset</h1>
      <p className="lead">
        {plural(rows.length, "row")} from {plural(ds.papersWithRows, "approved paper")}.
        {" "}{ds.approvedDone} of {plural(ds.approvedPapers, "approved paper")} {ds.approvedDone === 1 ? "is" : "are"} marked done.
      </p>

      <div className="row" style={{ alignItems: "center" }}>
        <a className="btn primary big" href="/api/dataset">Download Excel</a>
        <a className="btn" href="/api/dataset?format=csv">CSV instead</a>
      </div>
      <p className="muted mt">
        Only <b>approved</b> papers are included: approved by the votes, or by a final decision the team recorded. The Excel file has five sheets: <b>Effects</b> (one row per extracted effect, with the paper&apos;s coding attached), <b>Papers</b> (the master list with everyone&apos;s votes), <b>Search log</b> (every database search run in step 1, for the PRISMA diagram), <b>Keyword bank</b> (one row per query with what it found and how many of its candidates moved on), and the <b>Codebook</b>.
        {unfinished > 0 && <> {plural(unfinished, "approved paper")} {unfinished === 1 ? "is" : "are"} not marked done yet; {unfinished === 1 ? "its" : "their"} rows are included and flagged in the coding_done column.</>}
        <Help text="Pool delta with var_delta in a three-level model clustered on paper_id (metafor rma.mv with random = ~ 1 | paper_id / effect_id, plus cluster-robust SEs). Moderators are the coding columns. Binary rows also carry rd_delta and lnrr_delta for the absolute and relative scales." />
      </p>

      <details className="fold">
        <summary>Reporting audit</summary>
        <p className="muted">
          {ds.approvedPapers} approved papers, {ds.codingsOfApproved.length} with saved study features, {ds.papersWithRows} with at least one effect row.
          <Help text="Among approved papers, how many report results by group, and at what level of detail. Computed from the Reporting level field of each paper's coding." />
        </p>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <table className="grid" style={{ width: "auto", minWidth: 420 }}>
            <thead><tr><th>Reporting level</th><th>Papers</th></tr></thead>
            <tbody>{count(ds.codingsOfApproved, (c) => c.reporting_level || "").map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody>
          </table>
          <table className="grid" style={{ width: "auto", minWidth: 300 }}>
            <thead><tr><th>Single-group samples</th><th>Papers</th></tr></thead>
            <tbody>{count(ds.codingsOfApproved, (c) => c.single_group_sample === true ? "Yes" : c.single_group_sample === false ? "No" : "").map(([k, n]) => <tr key={k}><td>{k}</td><td>{n}</td></tr>)}</tbody>
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
        {rows.length === 0 ? <p className="muted">No effect rows from approved papers yet.</p> : (
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
