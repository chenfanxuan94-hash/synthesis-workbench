"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Help from "./Help";
import { runSearchAction } from "@/lib/actions";
import { DBS, OUTSIDE } from "@/lib/search/dbs";
import type { RunSummary } from "@/lib/search/run";

const LIMITS = [100, 200, 500, 1000];

// The search form at the top of step 1: keywords, which databases, how many to pull, years.
export default function SearchBox({ lastQuery }: { lastQuery?: string }) {
  const [q, setQ] = useState(lastQuery || "");
  const [dbs, setDbs] = useState<string[]>(DBS.map((d) => d.id));
  const [limit, setLimit] = useState(200);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunSummary | null>(null);
  const [err, setErr] = useState("");
  const router = useRouter();

  function toggle(id: string) {
    setDbs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function run() {
    if (!q.trim() || busy) return;
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await runSearchAction({ query: q, dbs, limit, yearFrom: yearFrom ? Number(yearFrom) : null, yearTo: yearTo ? Number(yearTo) : null });
      if (!r.ok) { setErr(r.error); return; }
      setResult(r);
      router.refresh();
    } catch (e: any) {
      setErr("The search did not finish: " + (e?.message || "unknown error") + ". Try again, or fewer databases at once.");
    } finally {
      setBusy(false);
    }
  }

  const query = q.trim();
  return (
    <div className="searchbox">
      <label className="block" style={{ marginTop: 0 }}>
        Keywords
        <Help text={'Type what you would type into PubMed: words, quotes for phrases, AND, OR, NOT, brackets. The same query goes to every ticked database. Example: ("school-based" OR school) AND ("mental health" OR counseling OR "social emotional") AND (randomized OR "control group")'} />
      </label>
      <div className="row" style={{ alignItems: "stretch", flexWrap: "nowrap" }}>
        <input className="bigfield" value={q} onChange={(e) => setQ(e.target.value)} placeholder='for example: ("school-based" OR school) AND ("mental health" OR counseling) AND (randomized OR "control group")'
          onKeyDown={(e) => { if (e.key === "Enter") run(); }} disabled={busy} />
        <button className="primary big" style={{ flex: "none", whiteSpace: "nowrap" }} onClick={run} disabled={busy || !query || dbs.length === 0}>{busy ? "Searching..." : "Search"}</button>
      </div>
      <div className="dbs">
        {DBS.map((d) => (
          <label key={d.id} className="inline" title={d.note}>
            <input type="checkbox" checked={dbs.includes(d.id)} onChange={() => toggle(d.id)} disabled={busy} /> {d.label}<Help text={d.note} />
          </label>
        ))}
        <span className="muted sep">|</span>
        <label className="inline">up to
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={busy} aria-label="Records per database">
            {LIMITS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select> per database<Help text="How many records to pull from each database, newest-relevance first. The count each database reports is always shown, so you know when a search is bigger than the pull; narrow the search or raise the limit." />
        </label>
        <label className="inline">years
          <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="from" style={{ width: 90 }} disabled={busy} aria-label="From year" />
          to
          <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="to" style={{ width: 90 }} disabled={busy} aria-label="To year" />
        </label>
      </div>
      {busy && <p className="muted" style={{ margin: "8px 0 0" }}>Asking {dbs.length} database{dbs.length === 1 ? "" : "s"} and reading the records. Usually 10 to 60 seconds; please keep this page open.</p>}
      {err && <div className="err mt">{err}</div>}
      {result && result.ok && (
        <div className="note good mt" style={{ marginBottom: 0 }}>
          <b>{result.added === 0 ? "No new papers." : `${result.added} new ${result.added === 1 ? "paper" : "papers"} added to the search list.`}</b>{" "}
          {result.pulled} records pulled, {result.merged} after merging the same paper from several databases, {result.existing} already in the library.
          <ul className="dblist">
            {DBS.filter((d) => result.per[d.id]).map((d) => {
              const r = result.per[d.id]!;
              return (
                <li key={d.id}>
                  <b>{d.label}:</b>{" "}
                  {r.error ? <span className="bad">{r.error}</span> : <>
                    {r.found.toLocaleString()} found{r.capped ? `, first ${r.pulled} pulled` : ""}, {r.added} new{r.dup ? `, ${r.dup} already known` : ""}
                    {r.capped && <span className="muted"> (raise the limit or narrow the search to pull the rest)</span>}
                  </>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {query && (
        <p className="muted outside" style={{ margin: "8px 0 0" }}>
          Open the same search elsewhere:{" "}
          {OUTSIDE.map((o) => <a key={o.label} href={o.open(query)} target="_blank" rel="noreferrer" title={o.note}>{o.label} &#8599;</a>)}
          {DBS.map((d) => <a key={d.id} href={d.open(query)} target="_blank" rel="noreferrer">{d.label} &#8599;</a>)}
          <Help text="Google Scholar, PsycINFO and Scopus cannot be searched by a program, so they are not in the list above. Check the query there by hand; to bring their results in, export them (RIS or CSV) and use Add papers, then Import, on this page, or add single papers by DOI." />
        </p>
      )}
    </div>
  );
}
