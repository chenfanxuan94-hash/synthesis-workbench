"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Help from "./Help";
import Ago from "./Ago";
import { runSearchAction, addKeywordIdea, removeKeywordIdea } from "@/lib/actions";
import { DBS, DB_LABEL, OUTSIDE } from "@/lib/search/dbs";
import { normalizeQuery, ideaDone, type BankRow, type TermCount, type KeywordIdea } from "@/lib/keywords";
import type { RunSummary } from "@/lib/search/run";
import type { Member } from "@/lib/types";

const LIMITS = [100, 200, 500, 1000];

type Props = {
  bank: BankRow[];
  terms: TermCount[];
  ideas: KeywordIdea[];
  ideasError: string | null;
  members: Member[];
  me: Member;
};

// The top of step 1: the search box, then the keyword bank (every query run so far and what it
// gave), the terms used so far, and the shared list of keywords still to try.
export default function SearchPanel({ bank, terms, ideas, ideasError, members, me }: Props) {
  const [q, setQ] = useState("");
  const [dbs, setDbs] = useState<string[]>(DBS.map((d) => d.id));
  const [limit, setLimit] = useState(200);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunSummary | null>(null);
  const [err, setErr] = useState("");
  const [showBank, setShowBank] = useState(true);
  const [ideaText, setIdeaText] = useState("");
  const [ideaNote, setIdeaNote] = useState("");
  const [ideaMsg, setIdeaMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name || "someone";

  function toggle(id: string) {
    setDbs((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function run(text?: string) {
    const query = (text ?? q).trim();
    if (!query || busy) return;
    if (text !== undefined) setQ(text);
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await runSearchAction({ query, dbs, limit, yearFrom: yearFrom ? Number(yearFrom) : null, yearTo: yearTo ? Number(yearTo) : null });
      if (!r.ok) { setErr(r.error); return; }
      setResult(r);
      router.refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setErr("The search did not finish: " + (e?.message || "unknown error") + ". Try again, or fewer databases at once.");
    } finally {
      setBusy(false);
    }
  }

  // Typing a query that was already run gets a note, not a block: databases keep adding records.
  const query = q.trim();
  const already = query ? bank.find((r) => r.key === normalizeQuery(query)) || null : null;

  function appendTerm(t: string) {
    const piece = /\s/.test(t) ? `"${t}"` : t;
    setQ((cur) => (cur.trim() ? `${cur.trim()} ${piece}` : piece));
  }

  function addIdea() {
    const t = ideaText.trim();
    if (!t) return;
    setIdeaMsg("");
    start(async () => {
      const r = await addKeywordIdea(t, ideaNote);
      if (!r.ok) { setIdeaMsg(r.error); return; }
      setIdeaText(""); setIdeaNote("");
      router.refresh();
    });
  }
  function removeIdea(id: string) {
    start(async () => {
      const r = await removeKeywordIdea(id);
      if (!r.ok) setIdeaMsg(r.error);
      router.refresh();
    });
  }

  const todo = ideas.map((i) => ({ i, done: ideaDone(i, bank) }));
  const open = todo.filter((x) => !x.done);
  const done = todo.filter((x) => x.done);

  return (
    <div className="searchbox">
      <label className="block" style={{ marginTop: 0 }}>
        Keywords
        <Help text={'Type what you would type into PubMed: words, quotes for phrases, AND, OR, NOT, brackets. The same query goes to every ticked database. Example: ("school-based" OR school) AND ("mental health" OR counseling OR "social emotional") AND (randomized OR "control group")'} />
      </label>
      <div className="row" style={{ alignItems: "stretch", flexWrap: "nowrap" }}>
        <input className="bigfield" value={q} onChange={(e) => setQ(e.target.value)} placeholder='for example: ("school-based" OR school) AND ("mental health" OR counseling) AND (randomized OR "control group")'
          onKeyDown={(e) => { if (e.key === "Enter") run(); }} disabled={busy} />
        <button className="primary big" style={{ flex: "none", whiteSpace: "nowrap" }} onClick={() => run()} disabled={busy || !query || dbs.length === 0}>{busy ? "Searching..." : "Search"}</button>
      </div>
      {already && !busy && (
        <div className="note warn already" style={{ margin: "8px 0 0" }}>
          <b>Already run</b> by {nameOf(already.lastBy)} <Ago iso={already.lastAt} /> in {already.dbs.map((d) => DB_LABEL[d] || d).join(", ")}: {already.found.toLocaleString()} found, {already.added} new{already.moved ? `, ${already.moved} moved to the master list` : ""}{already.runs > 1 ? ` (${already.runs} runs)` : ""}.
          Running it again only picks up records the databases have added since. To cover new ground, change a term or add one.
        </div>
      )}
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

      <div className="bank">
        <div className="bankhead">
          <b>Keyword bank</b>
          <Help text="Every query anyone has run, newest first, with what it found and what became of its candidates. Moved to the master list is the number that says whether a keyword pays off. Click a query to put it back in the box; click a term chip to add that term to what you are typing." />
          <span className="muted">{bank.length === 0 ? "nothing run yet" : `${bank.length} ${bank.length === 1 ? "query" : "queries"} run so far`}</span>
          <button className="link" style={{ marginLeft: "auto" }} onClick={() => setShowBank((v) => !v)}>{showBank ? "hide" : "show"}</button>
        </div>
        {showBank && (
          <>
            {bank.length > 0 && (
              <table className="grid bankt">
                <thead>
                  <tr><th>Query</th><th>Runs</th><th>Databases</th><th>Last run</th><th>Found</th><th>New</th><th>In the search list</th><th>Moved to the master list</th><th></th></tr>
                </thead>
                <tbody>
                  {bank.map((r) => (
                    <tr key={r.key}>
                      <td className="q"><button type="button" className="link qbtn" onClick={() => setQ(r.query)} title="Put this query in the search box">{r.query}</button></td>
                      <td>{r.runs}</td>
                      <td className="tiny">{r.dbs.map((d) => DB_LABEL[d] || d).join(", ")}{r.errors ? <span className="bad"> ({r.errors} failed)</span> : ""}</td>
                      <td className="nowrap tiny">{nameOf(r.lastBy)}, <Ago iso={r.lastAt} /></td>
                      <td>{r.found.toLocaleString()}</td>
                      <td>{r.added}</td>
                      <td>{r.inList}{r.out ? <span className="muted"> ({r.out} out)</span> : ""}</td>
                      <td><b>{r.moved}</b></td>
                      <td className="nowrap"><Link className="btn small" href={`/search?st=all&k=${encodeURIComponent(r.query)}`}>Its candidates</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {terms.length > 0 && (
              <p className="termline">
                <b>Terms used so far</b> <Help text="Each word or quoted phrase that appears in a query above, with the number of queries using it. Missing synonyms are the gaps to fill." />{" "}
                {terms.map((t) => (
                  <button key={t.term} type="button" className="term" onClick={() => appendTerm(t.term)} title={`In ${t.queries} ${t.queries === 1 ? "query" : "queries"}. Click to add it to the box.`}>
                    {t.term}<span className="n">{t.queries}</span>
                  </button>
                ))}
              </p>
            )}
            <div className="ideas">
              <b>Keywords to try</b>
              <Help text="A shared to-do list for the search. Add a keyword or a whole query, with a note on why. It is ticked off by itself once a search with the same text has been run." />
              {ideasError ? (
                <p className="muted" style={{ margin: "6px 0 0" }}>Not available until <span className="mono">supabase/migrate_v4.sql</span> has been run in Supabase ({ideasError}).</p>
              ) : (
                <>
                  {open.length === 0 && done.length === 0 && <p className="muted" style={{ margin: "6px 0 0" }}>Nothing on the list yet.</p>}
                  {open.length > 0 && (
                    <ul className="idealist">
                      {open.map(({ i }) => (
                        <li key={i.id}>
                          <button type="button" className="link qbtn" onClick={() => setQ(i.text)} title="Put it in the search box">{i.text}</button>
                          {i.note && <span className="muted"> - {i.note}</span>}
                          <span className="muted tiny"> ({nameOf(i.added_by)}, <Ago iso={i.created_at} />)</span>
                          <button type="button" className="small" onClick={() => run(i.text)} disabled={busy}>Search it</button>
                          <button type="button" className="link" onClick={() => removeIdea(i.id)} disabled={pending} aria-label="Remove">remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {done.length > 0 && (
                    <ul className="idealist done">
                      {done.map(({ i, done: d }) => (
                        <li key={i.id}>
                          <span className="ok">&#10003;</span> <s>{i.text}</s>
                          <span className="muted tiny"> run by {nameOf(d!.lastBy)} <Ago iso={d!.lastAt} />, {d!.added} new</span>
                          <button type="button" className="link" onClick={() => removeIdea(i.id)} disabled={pending} aria-label="Remove">remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="row addidea" style={{ alignItems: "center" }}>
                    <input value={ideaText} onChange={(e) => setIdeaText(e.target.value)} placeholder="keyword or query to try" style={{ width: 360 }} onKeyDown={(e) => { if (e.key === "Enter") addIdea(); }} disabled={pending} />
                    <input value={ideaNote} onChange={(e) => setIdeaNote(e.target.value)} placeholder="why (optional)" style={{ width: 260 }} onKeyDown={(e) => { if (e.key === "Enter") addIdea(); }} disabled={pending} />
                    <button type="button" className="small" onClick={addIdea} disabled={pending || !ideaText.trim()}>Add to the list</button>
                    {ideaMsg && <span className="bad">{ideaMsg}</span>}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
