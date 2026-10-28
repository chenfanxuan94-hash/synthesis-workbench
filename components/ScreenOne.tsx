"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Ago from "./Ago";
import ScreenChips from "./ScreenChips";
import { AiChip, RecordLinks, FoundChips, type ScreenRow } from "./ScreenTable";
import { saveScreen, setScreenDecision } from "@/lib/actions";
import { MARK_WORD, SCREEN_LABEL, explainScreen, screenStanding } from "@/lib/screening";
import { EXCLUSION_REASONS } from "@/lib/config";
import { DB_LABEL } from "@/lib/search/dbs";
import type { Member, ScreenMark } from "@/lib/types";

// Screening one candidate at a time: title, abstract and three big buttons, with keys R, N, U and S.
const DID: Record<string, string> = {
  moved: "Previous candidate: Relevant, moved to the master list.",
  out: "Previous candidate: marked Not relevant.",
  unsure: "Previous candidate: marked Unsure.",
  decided_in: "Previous candidate: decision recorded, moved to the master list.",
  decided_out: "Previous candidate: decision recorded, screened out.",
};

export default function ScreenOne({ r, members, me, left, nextId, did }: { r: ScreenRow; members: Member[]; me: Member; left: number; nextId: string | null; did?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [reason, setReason] = useState("");
  const flash = did ? DID[did] || "" : "";
  const router = useRouter();
  const mine = r.marks.find((m) => m.member_id === me.id)?.decision ?? null;
  const st = screenStanding({ screen_decision: r.byDecision ? (r.status === "in" ? "in" : "out") : null }, r.marks);
  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name || "someone";
  const nextHref = nextId ? `/search/screen?id=${nextId}` : "/search/screen";

  async function mark(d: ScreenMark) {
    if (busy) return;
    setBusy(true); setErr("");
    const res = await saveScreen(r.id, d, d === "not_relevant" ? reason : "");
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    router.push(`/search/screen?after=${r.id}&did=${res.moved ? "moved" : d === "not_relevant" ? "out" : "unsure"}`);
  }
  async function decide(d: "in" | "out") {
    setBusy(true); setErr("");
    const res = await setScreenDecision(r.id, d);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    router.push(`/search/screen?after=${r.id}&did=${d === "in" ? "decided_in" : "decided_out"}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "r") { e.preventDefault(); mark("relevant"); }
      else if (k === "n") { e.preventDefault(); mark("not_relevant"); }
      else if (k === "u") { e.preventDefault(); mark("unsure"); }
      else if (k === "s") { e.preventDefault(); router.push(`/search/screen?after=${r.id}`); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, reason, busy]);

  return (
    <div className="screenone">
      <div className="topline">
        <Link href="/search" className="btn primary homebtn"><span aria-hidden="true">&larr;</span> Search list</Link>
        <span className="muted">{left === 0 ? "Nothing else is waiting for you." : `${left} waiting for you`}</span>
        <Link href={`/search/screen?after=${r.id}`} className="skip">Skip this one (S)</Link>
      </div>
      {flash && <div className="note good">{flash}</div>}
      <div className="eyebrow">Step 1 &middot; Screen the title and abstract</div>
      <h1 className="ttl">{r.title || "(untitled)"}</h1>
      <p className="meta">{[r.authors, r.journal, r.year].filter(Boolean).join(" - ")}{r.cited_by !== null ? ` - cited ${r.cited_by} times` : ""}</p>
      <p className="sub chips"><FoundChips found={r.found_by} source={r.source} />{r.pdf && <span className="pill src">PDF</span>}<AiChip ai={r.ai} /></p>
      <div className="card">
        {r.abstract ? <p className="abs" style={{ margin: 0 }}>{r.abstract}</p> : <p className="muted" style={{ margin: 0 }}>This record has no abstract. Decide from the title, or open the record: <RecordLinks r={r} /></p>}
      </div>
      {r.keywords.length > 0 && <p className="sub"><b>Keywords:</b> {r.keywords.join("; ")}</p>}
      {r.found_by.length > 0 && <p className="sub"><b>Found by:</b> {r.found_by.map((f, i) => <span key={i} className="fb">{DB_LABEL[f.db] || f.db}: <i>{f.q}</i></span>)}</p>}
      <p className="sub"><b>Links:</b> <RecordLinks r={r} /></p>
      {r.ai && <p className="sub"><AiChip ai={r.ai} /> {r.ai.reason} <span className="muted">(a hint from the AI, not a decision)</span></p>}

      <div className="bigmarks">
        <button type="button" className={"yes" + (mine === "relevant" ? " on" : "")} onClick={() => mark("relevant")} disabled={busy}>Relevant <kbd>R</kbd></button>
        <button type="button" className={"no" + (mine === "not_relevant" ? " on" : "")} onClick={() => mark("not_relevant")} disabled={busy}>Not relevant <kbd>N</kbd></button>
        <button type="button" className={"maybe" + (mine === "unsure" ? " on" : "")} onClick={() => mark("unsure")} disabled={busy}>Unsure <kbd>U</kbd></button>
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <label className="inline muted">Reason, if Not relevant (optional)
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="">none</option>
            {EXCLUSION_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">Relevant means it may fit: when in doubt, say Relevant; the full text is checked at the Vote step. One Relevant moves the paper to the master list.</p>
      {err && <div className="err">{err}</div>}

      <div className="others">
        <b>Team marks</b> <ScreenChips members={members} marks={r.marks} />
        <span className={"pill " + (st.status === "in" ? "approved" : st.status === "out" ? "rejected" : st.status === "split" ? "split" : "needs_votes")} title={explainScreen(st)}>{SCREEN_LABEL[st.status]}</span>
        {r.marks.length > 0 && (
          <ul className="history">
            {r.marks.map((m) => <li key={m.member_id}><b>{nameOf(m.member_id)}</b> {MARK_WORD[m.decision]}{m.reason ? ` (${m.reason})` : ""} <span className="muted">&middot; <Ago iso={m.updated_at} /></span></li>)}
          </ul>
        )}
        {st.status === "split" && (
          <div className="row mt" style={{ alignItems: "center" }}>
            <span><b>People disagree.</b> Talk it through, then record:</span>
            <button className="small primary" onClick={() => decide("in")} disabled={busy}>Move to the master list</button>
            <button className="small" onClick={() => decide("out")} disabled={busy}>Screen out</button>
          </div>
        )}
      </div>
      <p className="muted">Added <Ago iso={r.created_at} />. {nextId ? <Link href={nextHref}>Next candidate &rarr;</Link> : null}</p>
    </div>
  );
}
