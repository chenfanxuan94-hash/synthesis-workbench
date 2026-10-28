"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Help from "./Help";
import Ago from "./Ago";
import ScreenChips from "./ScreenChips";
import { saveScreen, screenMany, setScreenDecision, backToSearch, deletePapers } from "@/lib/actions";
import { SCREEN_LABEL, MARK_WORD, explainScreen, screenStanding } from "@/lib/screening";
import { DB_LABEL } from "@/lib/search/dbs";
import type { AiScreen, FoundBy, Member, Screen, ScreenMark, ScreenStatus } from "@/lib/types";

export type ScreenRow = {
  id: string;
  title: string | null;
  authors: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  url: string | null;
  source: string | null;
  abstract: string | null;
  keywords: string[];
  found_by: FoundBy[];
  cited_by: number | null;
  pdf: boolean;
  created_at: string;
  marks: Screen[];
  status: ScreenStatus;
  byDecision: boolean;
  ai: AiScreen | null;
};

const PILL: Record<ScreenStatus, string> = { pending: "needs_votes", in: "approved", out: "rejected", split: "split" };

type Local = { mark?: ScreenMark | null; moved?: boolean; status?: ScreenStatus; error?: string };

export const AI_WORD: Record<string, string> = { likely: "AI: likely", unlikely: "AI: unlikely", unclear: "AI: unclear" };

export function AiChip({ ai }: { ai: AiScreen | null }) {
  if (!ai) return null;
  return <span className={"pill ai-" + ai.verdict} title={ai.reason}>{AI_WORD[ai.verdict] || "AI"}</span>;
}

// Links to the record on the web: the DOI, the database page, a Google Scholar lookup by title.
export function RecordLinks({ r }: { r: { title: string | null; doi: string | null; pmid: string | null; url: string | null } }) {
  const scholar = r.title ? `https://scholar.google.com/scholar?q=${encodeURIComponent('"' + r.title + '"')}` : null;
  return (
    <span className="reclinks">
      {r.doi && <a href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">doi.org &#8599;</a>}
      {r.pmid && <a href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noreferrer">PubMed &#8599;</a>}
      {r.url && !/pubmed\.ncbi/.test(r.url) && <a href={r.url} target="_blank" rel="noreferrer">record &#8599;</a>}
      {scholar && <a href={scholar} target="_blank" rel="noreferrer">Google Scholar &#8599;</a>}
    </span>
  );
}

export function FoundChips({ found, source }: { found: FoundBy[]; source: string | null }) {
  const dbs = Array.from(new Set(found.map((f) => f.db)));
  if (dbs.length === 0) return <span className="pill src" title={source || ""}>{source || "added by hand"}</span>;
  return (
    <>
      {dbs.map((d) => {
        const qs = Array.from(new Set(found.filter((f) => f.db === d).map((f) => f.q)));
        return <span key={d} className="pill src" title={`Found by: ${qs.join(" | ")}`}>{DB_LABEL[d] || d}</span>;
      })}
    </>
  );
}

export default function ScreenTable({ rows, members, me, pi, empty }: { rows: ScreenRow[]; members: Member[]; me: Member; pi: boolean; empty?: React.ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);
  const [local, setLocal] = useState<Record<string, Local>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [toasts, setToasts] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name || "someone";

  // When the server sends fresh rows, local overlays for rows that are still here are no longer needed.
  useEffect(() => { setLocal({}); setSel({}); }, [rows]);

  function refreshSoon() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 900);
  }

  async function mark(r: ScreenRow, decision: ScreenMark | null) {
    const mine = r.marks.find((m) => m.member_id === me.id)?.decision ?? null;
    const next = decision === mine ? null : decision; // clicking your own mark again clears it
    setLocal((x) => ({ ...x, [r.id]: { ...x[r.id], mark: next, error: undefined } }));
    const res = await saveScreen(r.id, next);
    if (!res.ok) { setLocal((x) => ({ ...x, [r.id]: { ...x[r.id], mark: mine, error: res.error } })); return; }
    setLocal((x) => ({ ...x, [r.id]: { ...x[r.id], mark: next, status: res.status, moved: res.moved } }));
    if (res.moved) setToasts((t) => [{ id: r.id, title: r.title || "(untitled)" }, ...t].slice(0, 5));
    refreshSoon();
  }

  async function decide(r: ScreenRow, d: "in" | "out" | null) {
    const res = await setScreenDecision(r.id, d);
    if (!res.ok) { setLocal((x) => ({ ...x, [r.id]: { ...x[r.id], error: res.error } })); return; }
    setLocal((x) => ({ ...x, [r.id]: { ...x[r.id], status: res.status, moved: res.moved } }));
    if (res.moved) setToasts((t) => [{ id: r.id, title: r.title || "(untitled)" }, ...t].slice(0, 5));
    refreshSoon();
  }

  async function undo(id: string) {
    const res = await backToSearch(id);
    if (!res.ok) { setErr("Could not undo: " + res.error); return; }
    setToasts((t) => t.filter((x) => x.id !== id));
    router.refresh();
  }

  const selected = Object.keys(sel).filter((k) => sel[k]);
  async function bulk(decision: ScreenMark) {
    if (selected.length === 0) return;
    setBusy(true); setErr("");
    const res = await screenMany(selected, decision);
    setBusy(false);
    if (!res.ok) setErr(res.error || "Something went wrong.");
    setSel({});
    router.refresh();
  }
  async function bulkDelete() {
    if (selected.length === 0) return;
    if (!confirm(`Delete ${selected.length} candidate${selected.length === 1 ? "" : "s"} from the search list? This cannot be undone.`)) return;
    setBusy(true); setErr("");
    const res = await deletePapers(selected);
    setBusy(false);
    if (!res.ok) setErr(res.error || "Something went wrong.");
    setSel({});
    router.refresh();
  }

  const isOpen = (id: string) => (open[id] === undefined ? allOpen : open[id]);
  const toggleAll = () => { setAllOpen((a) => !a); setOpen({}); };
  const allSelected = rows.length > 0 && rows.every((r) => sel[r.id]);

  return (
    <div>
      {toasts.length > 0 && (
        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className="toast">
              <span>Moved to the master list: <i>{t.title.slice(0, 90)}{t.title.length > 90 ? "..." : ""}</i></span>
              <Link href={`/papers/${t.id}`}>Open</Link>
              <button className="link" onClick={() => undo(t.id)}>Undo</button>
              <button className="link" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))} aria-label="Dismiss">&#10005;</button>
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 && <div className="listline">
        <span>
          <button className="small" onClick={toggleAll}>{allOpen ? "Collapse all abstracts" : "Expand all abstracts"}</button>
          {" "}<span className="muted">Click a title to read its abstract here, without opening anything.</span>
        </span>
        {rows.length > 0 && (
          <span className="muted bulk">
            {selected.length > 0 ? <b>{selected.length} ticked:</b> : "Tick rows to mark several at once:"}{" "}
            <button className="small" disabled={busy || selected.length === 0} onClick={() => bulk("relevant")}>Relevant</button>{" "}
            <button className="small" disabled={busy || selected.length === 0} onClick={() => bulk("not_relevant")}>Not relevant</button>
            {pi && <>{" "}<button className="small danger" disabled={busy || selected.length === 0} onClick={bulkDelete}>Delete</button></>}
          </span>
        )}
      </div>}
      {err && <div className="err">{err}</div>}
      {rows.length === 0 && empty}
      {rows.length > 0 && <table className="grid master screen">
        <thead>
          <tr>
            <th className="tick"><input type="checkbox" checked={allSelected} onChange={() => setSel(allSelected ? {} : Object.fromEntries(rows.map((r) => [r.id, true])))} aria-label="Select all on this page" /></th>
            <th>Paper</th>
            <th>Keywords<Help text="Subject terms the database attached to the record (MeSH terms, ERIC descriptors, OpenAlex keywords). Hover a database chip under the title to see which of your searches found it." /></th>
            <th>Screening<Help text="One chip per team member: green Relevant, red Not relevant, amber Unsure, grey not yet. Hover for the name." /></th>
            <th>Status</th>
            <th>Your mark</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const l = local[r.id] || {};
            const myMark = l.mark !== undefined ? l.mark : r.marks.find((m) => m.member_id === me.id)?.decision ?? null;
            const marks = l.mark !== undefined
              ? [...r.marks.filter((m) => m.member_id !== me.id), ...(l.mark ? [{ id: "local", paper_id: r.id, member_id: me.id, decision: l.mark, reason: null, updated_at: new Date().toISOString() }] : [])]
              : r.marks;
            const live = screenStanding({ screen_decision: r.byDecision ? (r.status === "in" ? "in" : "out") : null }, marks);
            const status = l.status || (l.mark !== undefined ? live.status : r.status);
            const moved = Boolean(l.moved);
            const names = marks.map((m) => `${nameOf(m.member_id)} ${MARK_WORD[m.decision]}`);
            const authors = r.authors ? r.authors.split(";").slice(0, 3).join(";") + (r.authors.split(";").length > 3 ? "; et al." : "") : "";
            const expanded = isOpen(r.id);
            return [
              <tr key={r.id} className={"cand" + (expanded ? " open" : "") + (moved ? " moved" : "")}>
                <td className="tick"><input type="checkbox" checked={Boolean(sel[r.id])} onChange={(e) => setSel((x) => ({ ...x, [r.id]: e.target.checked }))} aria-label={`Select ${r.title || "untitled"}`} /></td>
                <td className="paper">
                  <button type="button" className={"exp" + (expanded ? " on" : "")} onClick={() => setOpen((o) => ({ ...o, [r.id]: !expanded }))} aria-expanded={expanded} title={expanded ? "Hide the abstract" : "Show the abstract"}>
                    <span className="tri" aria-hidden="true">{expanded ? "▾" : "▸"}</span>
                    <span className="ttl">{r.title || "(untitled)"}</span>
                  </button>
                  <div className="sub">{[authors, r.journal, r.year].filter(Boolean).join(" - ")}{r.cited_by !== null ? ` - cited ${r.cited_by}` : ""}{r.abstract ? "" : " - no abstract in the record"}</div>
                  <div className="sub tiny chips"><FoundChips found={r.found_by} source={r.source} />{r.pdf && <span className="pill src">PDF</span>}<AiChip ai={r.ai} /></div>
                </td>
                <td className="kw">
                  {r.keywords.length === 0 ? <span className="muted">-</span> : <>{r.keywords.slice(0, 4).join("; ")}{r.keywords.length > 4 && <span className="muted"> +{r.keywords.length - 4}</span>}</>}
                </td>
                <td className="nowrap"><ScreenChips members={members} marks={marks} /></td>
                <td className="nowrap">
                  {moved
                    ? <span className="pill approved">Moved to the master list</span>
                    : <span className={"pill " + PILL[status]} title={explainScreen({ ...live, status }, names)}>{SCREEN_LABEL[status]}</span>}
                </td>
                <td className="marks nowrap">
                  {moved ? (
                    <Link className="btn small" href={`/papers/${r.id}`}>Open</Link>
                  ) : (
                    <div className="mkbtns">
                      <button type="button" className={"yes" + (myMark === "relevant" ? " on" : "")} onClick={() => mark(r, "relevant")} title="Relevant: looks like it may fit. Moves the paper to the master list.">Relevant</button>
                      <button type="button" className={"no" + (myMark === "not_relevant" ? " on" : "")} onClick={() => mark(r, "not_relevant")} title="Not relevant: clearly does not fit.">Not relevant</button>
                      <button type="button" className={"maybe" + (myMark === "unsure" ? " on" : "")} onClick={() => mark(r, "unsure")} title="Unsure: leave it for someone else to look at.">Unsure</button>
                    </div>
                  )}
                  {l.error && <div className="err tiny">{l.error}</div>}
                </td>
              </tr>,
              expanded && (
                <tr key={r.id + "-x"} className="expanded">
                  <td></td>
                  <td colSpan={5}>
                    <div className="absbox">
                      {r.abstract ? <p className="abs">{r.abstract}</p> : <p className="muted">This record has no abstract. Decide from the title, or open the record below.</p>}
                      {r.keywords.length > 0 && <p className="sub"><b>Keywords:</b> {r.keywords.join("; ")}</p>}
                      {r.found_by.length > 0 && (
                        <p className="sub"><b>Found by:</b> {r.found_by.map((f, i) => <span key={i} className="fb">{DB_LABEL[f.db] || f.db}: <i>{f.q}</i></span>)}</p>
                      )}
                      <p className="sub"><b>Links:</b> <RecordLinks r={r} /> <Link href={`/search/screen?id=${r.id}`}>Screen it on its own page</Link></p>
                      {r.ai && <p className="sub"><AiChip ai={r.ai} /> {r.ai.reason} <span className="muted">(a hint from the AI, not a decision)</span></p>}
                      {marks.length > 0 && (
                        <p className="sub"><b>Marks:</b> {marks.map((m) => <span key={m.member_id} className="fb">{nameOf(m.member_id)}: {MARK_WORD[m.decision]}{m.reason ? ` (${m.reason})` : ""}</span>)}</p>
                      )}
                      <div className="row" style={{ alignItems: "center" }}>
                        {status === "split" && !moved && <>
                          <span><b>People disagree.</b> Talk it through, then record:</span>
                          <button className="small primary" onClick={() => decide(r, "in")}>Move to the master list</button>
                          <button className="small" onClick={() => decide(r, "out")}>Screen out</button>
                        </>}
                        {status === "out" && !moved && <>
                          <span className="muted">Screened out{r.byDecision ? " by a recorded decision" : ""}.</span>
                          <button className="small" onClick={() => decide(r, "in")}>Move to the master list anyway</button>
                        </>}
                        {r.byDecision && !moved && <button className="small" onClick={() => decide(r, null)}>Clear the recorded decision</button>}
                        {myMark && !moved && <button className="small" onClick={() => mark(r, myMark)}>Clear my mark</button>}
                        <span className="muted" style={{ marginLeft: "auto" }}>added <Ago iso={r.created_at} /></span>
                      </div>
                    </div>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>}
    </div>
  );
}
