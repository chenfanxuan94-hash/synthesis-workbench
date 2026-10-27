"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Help from "./Help";
import Instructions from "./Instructions";
import AiDraft from "./AiDraft";
import EffectForm, { type Selection } from "./EffectForm";
import { DoneBox, EXTRACTABLE } from "./CodeTab";
import { deleteEffect, saveEffect } from "@/lib/actions";
import { computeEffect } from "@/lib/effects";
import { OUTCOME_FAMILIES, GROUP_DIMENSIONS, TIERS } from "@/lib/config";
import { STATUS_LABEL } from "@/lib/status";
import Ago from "./Ago";
import type { Candidate, DraftResult } from "@/lib/ai";
import type { Task } from "@/lib/steps";
import type { Coding, Effect, Member, Paper, Standing } from "@/lib/types";

type Editing = { mode: "new" } | { mode: "edit"; effect: Effect } | { mode: "draft"; initial: Record<string, any>; id: string } | null;

// Rows the AI proposed. They stay listed (in this browser, per paper) until someone clears the
// list, so switching tabs or reloading does not lose a read, and several reads add up.
type DraftItem = { id: string; c: Candidate; status: "new" | "added" | "skipped"; incomplete?: boolean; error?: string };
type DraftStore = { items: DraftItem[]; reads: { source: string; summary: string; at: string; found: number }[] };
const EMPTY: DraftStore = { items: [], reads: [] };

function signature(c: Candidate): string {
  const { confidence: _a, caution: _b, quote: _c, ...rest } = c as any;
  return JSON.stringify(rest);
}

function candidateToInitial(c: Candidate): Record<string, any> {
  const v: Record<string, any> = { ...c };
  delete v.confidence; delete v.caution;
  v.notes = c.caution ? "AI noted: " + c.caution : "";
  return v;
}

function isIncomplete(c: Candidate): boolean {
  return computeEffect({ ...(candidateToInitial(c) as any), higher_is_worse: Boolean(c.higher_is_worse) }).delta === null;
}

export default function EffectsTab({ paper, me, members, effects, coding, s, task, aiReady, goCode, selection, clearSelection, showText }: {
  paper: Paper; me: Member; members: Member[]; effects: Effect[]; coding: Coding | null; s: Standing; task: Task | null; aiReady: boolean;
  goCode: () => void; selection: Selection | null; clearSelection: () => void; showText: () => void;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [showAi, setShowAi] = useState(false);
  const [store, setStore] = useState<DraftStore>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "someone";
  const draftsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const storeKey = "wb_drafts_" + paper.id;
  useEffect(() => {
    try { const raw = localStorage.getItem(storeKey); if (raw) setStore(JSON.parse(raw)); } catch { /* storage unavailable */ }
    setLoaded(true);
  }, [storeKey]);
  useEffect(() => {
    if (!loaded) return;
    try { if (store.items.length) localStorage.setItem(storeKey, JSON.stringify(store)); else localStorage.removeItem(storeKey); } catch { /* storage unavailable */ }
  }, [store, loaded, storeKey]);
  const patch = (id: string, p: Partial<DraftItem>) => setStore((st) => ({ ...st, items: st.items.map((it) => (it.id === id ? { ...it, ...p } : it)) }));

  useEffect(() => { if (selection && editing === null) setEditing({ mode: "new" }); }, [selection]); // eslint-disable-line
  // Bring the opened form into view so nothing happens off screen.
  useEffect(() => { if (editing !== null) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editing]);

  function addRead(r: Extract<DraftResult, { ok: true }>) {
    setStore((st) => {
      const seen = new Set(st.items.map((it) => signature(it.c)));
      const fresh = r.candidates.filter((c) => !seen.has(signature(c))).map((c, k) => ({ id: `${Date.now().toString(36)}-${k}`, c, status: "new" as const }));
      return { items: [...st.items, ...fresh], reads: [...st.reads, { source: r.source, summary: r.summary, at: new Date().toISOString(), found: r.candidates.length }] };
    });
    setShowAi(false);
    setTimeout(() => draftsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function addDirect(items: DraftItem[]) {
    setErr("");
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      setAdding(items.length > 1 ? `Adding ${k + 1} of ${items.length}...` : "Adding...");
      const r = await saveEffect(paper.id, null, candidateToInitial(it.c), true);
      if (r.ok) patch(it.id, { status: "added", incomplete: isIncomplete(it.c), error: undefined });
      else patch(it.id, { error: r.error });
    }
    setAdding("");
    router.refresh();
  }

  const level = coding?.reporting_level || null;

  function remove(e: Effect) {
    if (!confirm("Delete this row? This cannot be undone.")) return;
    setErr("");
    start(async () => {
      const r = await deleteEffect(paper.id, e.id);
      if (!r.ok) { setErr(r.error); return; }
      router.refresh();
    });
  }
  function done() {
    if (editing?.mode === "draft") patch(editing.id, { status: "added", incomplete: false, error: undefined });
    setEditing(null);
    clearSelection();
    router.refresh();
  }
  const fmt = (v: number | null) => (v === null ? "" : v.toFixed(2));
  const open = store.items.filter((it) => it.status === "new");
  const addedCount = store.items.filter((it) => it.status === "added").length;

  return (
    <div className="stack">
      <Instructions id="effects" title="What to do: copy the numbers by group">
        <ol>
          <li>Find the results split by group (Black vs White, Latinx vs White, or lower vs higher income): the Results section, the tables, or the online supplement.</li>
          <li><b>Fast way:</b> click <b>Draft the rows with AI</b> and paste a screenshot of a table. Check each draft row against the paper, then <b>Add</b> it (or <b>Add all</b>). Read more tables and their rows join the same list.</li>
          <li><b>By hand:</b> click <b>Add a row by hand</b>. To copy numbers quickly, <button className="link" onClick={showText}>switch the left side to Text</button>, select the sentence or table row with your mouse, then click each number in the yellow box.</li>
          <li>Check that the green Result box shows a number, then click <b>Save effect</b>. One row per outcome, per group comparison, per time point.</li>
          <li>When every row is in, click <b>Mark this paper done</b>.</li>
        </ol>
        <p style={{ margin: 0 }}>Not sure what goes where? <Link href="/guide#example" target="_blank">Open the worked example</Link> in a new tab.</p>
      </Instructions>

      {s.status !== "approved" && (
        <div className="note warn">This paper is not approved yet ({STATUS_LABEL[s.status]}). You can still enter numbers; only approved papers go into the dataset.</div>
      )}
      {!coding && (
        <div className="note info">The study features have not been saved yet. You can enter numbers now and <button className="link" onClick={goCode}>fill in the Code tab</button> before marking the paper done.</div>
      )}
      {coding && level && !EXTRACTABLE.includes(level) && (
        <div className="note info">
          The coding says: <b>{level}</b>. That means there are probably no numbers by group to copy from this paper.
          If you do find results by group, <button className="link" onClick={goCode}>change the reporting level in the Code tab</button> too.
        </div>
      )}

      {editing === null && (
        <div className="row">
          <button className="primary big" onClick={() => { setShowAi(true); }} disabled={!aiReady} title={aiReady ? "" : "AI drafts are not set up yet"}>Draft the rows with AI</button>
          <button className="big" onClick={() => setEditing({ mode: "new" })}>+ Add a row by hand</button>
        </div>
      )}
      {!aiReady && editing === null && (
        <p className="muted" style={{ margin: 0 }}>AI drafts are not set up yet: add the <span className="mono">ANTHROPIC_API_KEY</span> in the Vercel project settings.</p>
      )}

      {showAi && editing === null && (
        <AiDraft paperId={paper.id} pageCount={(paper.pages || []).length}
          onClose={() => setShowAi(false)}
          onResult={addRead} />
      )}

      {(store.items.length > 0 || store.reads.length > 0) && (
        <div className="draftbox" ref={draftsRef}>
          <div className="aihead">
            <b>AI-drafted rows: {store.items.length}</b>
            <span className="muted">{addedCount} added, {open.length} still to check</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {open.length > 1 && <button className="primary small" disabled={Boolean(adding) || pending} onClick={() => { if (confirm(`Add all ${open.length} rows that are still open? Each is saved as an AI draft with your name as the checker; you can edit or delete any of them in the table below.`)) addDirect(open); }}>Add all {open.length}</button>}
              <button className="link" disabled={Boolean(adding)} onClick={() => { if (confirm("Clear this list of AI-drafted rows? Rows already added stay in the table.")) setStore(EMPTY); }}>clear list</button>
            </span>
          </div>
          {store.reads.map((r, k) => (
            <p key={k} className="readline">Read {k + 1}, from {r.source}: found {r.found} {r.found === 1 ? "row" : "rows"}.{r.summary ? " " + r.summary : ""}</p>
          ))}
          {adding && <div className="note info" style={{ margin: "8px 0 0" }}>{adding}</div>}
          {store.items.map((it) => it.status === "new"
            ? <DraftCard key={it.id} c={it.c} error={it.error} busy={Boolean(adding) || pending} editingThis={editing?.mode === "draft" && editing.id === it.id}
                onAdd={() => addDirect([it])}
                onEdit={() => setEditing({ mode: "draft", initial: candidateToInitial(it.c), id: it.id })}
                onSkip={() => patch(it.id, { status: "skipped" })} />
            : <DraftDone key={it.id} it={it} onUndo={() => patch(it.id, { status: "new" })} />)}
          {open.length > 0 && <p className="muted" style={{ margin: "10px 0 0" }}>Check each row against the paper. <b>Add</b> saves it as shown; <b>Edit, then add</b> opens the form first. Want more rows? Click <b>Draft the rows with AI</b> again with another table; the new rows join this list.</p>}
        </div>
      )}

      {editing !== null && (
        <div ref={formRef}>
        <EffectForm
          paperId={paper.id}
          effect={editing.mode === "edit" ? editing.effect : null}
          initial={editing.mode === "draft" ? editing.initial : null}
          aiDraft={editing.mode === "draft"}
          selection={selection}
          clearSelection={clearSelection}
          onDone={done}
          onCancel={() => { setEditing(null); clearSelection(); }}
        />
        </div>
      )}

      {err && <div className="err">{err}</div>}

      {effects.length > 0 && (
        <>
          <h3>Rows entered for this paper</h3>
          <table className="grid">
            <thead>
              <tr><th>Outcome</th><th>Groups</th><th>Gap change<Help text="delta, with its standard error in brackets. Positive means the marginalized group gained more, so the gap got smaller. Negative means the gap got bigger." /></th><th>Who</th><th></th></tr>
            </thead>
            <tbody>
              {effects.map((e) => (
                <tr key={e.id}>
                  <td>{OUTCOME_FAMILIES[e.outcome_family]}<br />{e.outcome_name || ""}{e.timepoint ? ` (${e.timepoint})` : ""}<div className="sub">{e.page ? `p. ${e.page} ` : ""}{e.source_label || ""}</div></td>
                  <td>{GROUP_DIMENSIONS[e.group_dimension]}{e.group_dimension === "other" ? `: ${e.marginalized_group} vs ${e.comparison_group}` : ""}</td>
                  <td className="nowrap">{e.delta === null ? <span className="pill split">incomplete</span> : `${fmt(e.delta)} (${fmt(e.var_delta !== null ? Math.sqrt(e.var_delta) : null)})`}</td>
                  <td>
                    <div className="sub" style={{ marginTop: 0 }}>
                      {e.ai_assisted && <span className="pill ai">AI draft</span>}{e.ai_assisted ? " checked and saved by " : "entered by "}{nameOf(e.entered_by)}
                      {e.updated_by && e.updated_by !== e.entered_by ? <>, edited by {nameOf(e.updated_by)}</> : ""} <Ago iso={e.updated_at || e.created_at} />
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button className="small" onClick={() => setEditing({ mode: "edit", effect: e })} disabled={pending}>Edit</button>
                      <button className="small" onClick={() => remove(e)} disabled={pending}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {editing === null && <DoneBox paper={paper} coding={coding} effects={effects} task={task} members={members} />}
    </div>
  );
}

function DraftDone({ it, onUndo }: { it: DraftItem; onUndo: () => void }) {
  const c = it.c;
  const label = `${c.outcome_name || OUTCOME_FAMILIES[c.outcome_family]} (${c.timepoint || "post-test"}), ${c.group_dimension === "other" ? `${c.marginalized_group} vs ${c.comparison_group}` : GROUP_DIMENSIONS[c.group_dimension]}`;
  return (
    <div className={"draftdone " + it.status}>
      {it.status === "added" ? <span className="ok">&#10003; Added</span> : <span className="muted">Skipped</span>}
      <span>{label}</span>
      {it.status === "added" && it.incomplete && <span className="pill split">incomplete: some numbers are missing, finish it with Edit in the table below</span>}
      {it.status === "skipped" && <button className="link" onClick={onUndo}>undo</button>}
    </div>
  );
}

function DraftCard({ c, error, busy, editingThis, onAdd, onEdit, onSkip }: { c: Candidate; error?: string; busy: boolean; editingThis: boolean; onAdd: () => void; onEdit: () => void; onSkip: () => void }) {
  const n = (v: number | null) => (v === null ? <span className="muted">?</span> : String(v));
  return (
    <div className={"draft " + c.confidence + (editingThis ? " editing" : "")}>
      <div className="draft-top">
        <span className={"pill conf-" + c.confidence}>{c.confidence === "high" ? "looks clear" : c.confidence === "medium" ? "check the labels" : "unsure, check carefully"}</span>
        <b>{c.outcome_name || OUTCOME_FAMILIES[c.outcome_family]}</b> <span className="muted">({c.timepoint || "post-test"})</span>
        <span>&middot; {c.group_dimension === "other" ? `${c.marginalized_group} vs ${c.comparison_group}` : GROUP_DIMENSIONS[c.group_dimension]}</span>
        <span className="muted">&middot; {OUTCOME_FAMILIES[c.outcome_family]} &middot; {c.higher_is_worse ? "higher is worse" : "higher is better"}</span>
      </div>
      <div className="muted" style={{ fontSize: 15 }}>{TIERS[c.tier]}</div>
      {c.tier === "cells" && (
        <table className="mini">
          <thead><tr><th></th><th colSpan={c.outcome_type === "binary" ? 2 : 3}>Got the program</th><th colSpan={c.outcome_type === "binary" ? 2 : 3}>Did not (control)</th></tr>
            <tr><th></th>{c.outcome_type === "binary" ? <><th>had it</th><th>of n</th><th>had it</th><th>of n</th></> : <><th>n</th><th>mean</th><th>SD</th><th>n</th><th>mean</th><th>SD</th></>}</tr></thead>
          <tbody>
            {(["m", "c"] as const).map((g) => (
              <tr key={g}><th>{g === "m" ? c.marginalized_group || "m" : c.comparison_group || "c"}</th>
                {c.outcome_type === "binary"
                  ? <><td>{n((c as any)[`${g}_t_events`])}</td><td>{n((c as any)[`${g}_t_n`])}</td><td>{n((c as any)[`${g}_c_events`])}</td><td>{n((c as any)[`${g}_c_n`])}</td></>
                  : <><td>{n((c as any)[`${g}_t_n`])}</td><td>{n((c as any)[`${g}_t_mean`])}</td><td>{n((c as any)[`${g}_t_sd`])}</td><td>{n((c as any)[`${g}_c_n`])}</td><td>{n((c as any)[`${g}_c_mean`])}</td><td>{n((c as any)[`${g}_c_sd`])}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {c.tier === "subgroup" && <div className="mono">{c.marginalized_group}: {n(c.sg_d_m)} (SE {n(c.sg_se_m)}) &nbsp; {c.comparison_group}: {n(c.sg_d_c)} (SE {n(c.sg_se_c)})</div>}
      {c.tier === "interaction" && <div className="mono">interaction {n(c.int_coef)} (SE {n(c.int_se)}), {c.int_scale}</div>}
      <div className="sub">{c.page ? `p. ${c.page} ` : ""}{c.source_label}{c.quote ? <> &middot; <i>&quot;{c.quote.length > 220 ? c.quote.slice(0, 220) + "..." : c.quote}&quot;</i></> : ""}</div>
      {c.caution && <div className="caution">AI notes: {c.caution}</div>}
      {error && <div className="err">Could not add: {error}</div>}
      {editingThis ? (
        <div className="note info" style={{ marginBottom: 0 }}>Open in the form below. Save it there to add it.</div>
      ) : (
        <div className="row mt" style={{ gap: 8 }}>
          <button className="primary" onClick={onAdd} disabled={busy}>Add</button>
          <button onClick={onEdit} disabled={busy}>Edit, then add</button>
          <button onClick={onSkip} disabled={busy}>Skip</button>
        </div>
      )}
    </div>
  );
}
