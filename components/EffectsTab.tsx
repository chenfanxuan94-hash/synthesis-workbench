"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Help from "./Help";
import Instructions from "./Instructions";
import AiDraft from "./AiDraft";
import EffectForm, { type Selection } from "./EffectForm";
import { DoneBox, EXTRACTABLE } from "./CodeTab";
import { deleteEffect } from "@/lib/actions";
import { OUTCOME_FAMILIES, GROUP_DIMENSIONS, TIERS } from "@/lib/config";
import { STATUS_LABEL } from "@/lib/status";
import Ago from "./Ago";
import type { Candidate, DraftResult } from "@/lib/ai";
import type { Task } from "@/lib/steps";
import type { Coding, Effect, Member, Paper, Standing } from "@/lib/types";

type Editing = { mode: "new" } | { mode: "edit"; effect: Effect } | { mode: "draft"; initial: Record<string, any>; index: number } | null;
type Drafts = { candidates: Candidate[]; summary: string; source: string; model: string };

function candidateToInitial(c: Candidate): Record<string, any> {
  const v: Record<string, any> = { ...c };
  delete v.confidence; delete v.caution;
  v.notes = c.caution ? "AI noted: " + c.caution : "";
  return v;
}

export default function EffectsTab({ paper, me, members, effects, coding, s, task, aiReady, goCode, selection, clearSelection, showText }: {
  paper: Paper; me: Member; members: Member[]; effects: Effect[]; coding: Coding | null; s: Standing; task: Task | null; aiReady: boolean;
  goCode: () => void; selection: Selection | null; clearSelection: () => void; showText: () => void;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const [showAi, setShowAi] = useState(false);
  const [drafts, setDrafts] = useState<Drafts | null>(null);
  const [used, setUsed] = useState<number[]>([]);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "someone";
  const draftsRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (selection && editing === null) setEditing({ mode: "new" }); }, [selection]); // eslint-disable-line
  // Bring the new drafts, or the opened form, into view so nothing happens off screen.
  useEffect(() => { if (drafts && !showAi && editing === null) draftsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [drafts, showAi, editing]);
  useEffect(() => { if (editing !== null) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editing]);

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
    if (editing?.mode === "draft") setUsed((u) => [...u, editing.index]);
    setEditing(null);
    clearSelection();
    router.refresh();
  }
  const fmt = (v: number | null) => (v === null ? "" : v.toFixed(2));
  const remaining = drafts ? drafts.candidates.map((c, i) => ({ c, i })).filter(({ i }) => !used.includes(i) && !skipped.includes(i)) : [];

  return (
    <div className="stack">
      <Instructions id="effects" title="What to do: copy the numbers by group">
        <ol>
          <li>Find the results split by group (Black vs White, Latinx vs White, or lower vs higher income): the Results section, the tables, or the online supplement.</li>
          <li><b>Fast way:</b> click <b>Draft the rows with AI</b>, paste a screenshot of the table, and check each draft row against the paper before saving it.</li>
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
          onResult={(r) => { setDrafts({ candidates: r.candidates, summary: r.summary, source: r.source, model: r.model }); setUsed([]); setSkipped([]); setShowAi(false); }} />
      )}

      {drafts && !showAi && editing === null && (
        <div className="draftbox" ref={draftsRef}>
          <div className="aihead">
            <b>The AI found {drafts.candidates.length} {drafts.candidates.length === 1 ? "row" : "rows"}</b> <span className="muted">from {drafts.source}</span>
            <button className="link" style={{ marginLeft: "auto" }} onClick={() => setDrafts(null)}>clear</button>
          </div>
          {drafts.summary && <p style={{ margin: "6px 0 10px" }}>{drafts.summary}</p>}
          {drafts.candidates.length > 0 && remaining.length === 0 && <div className="note good" style={{ margin: 0 }}>Every draft row has been handled.</div>}
          {remaining.map(({ c, i }) => <DraftCard key={i} c={c} onUse={() => setEditing({ mode: "draft", initial: candidateToInitial(c), index: i })} onSkip={() => setSkipped((x) => [...x, i])} />)}
          {remaining.length > 0 && <p className="muted" style={{ margin: "10px 0 0" }}>Check each row against the paper. Use this row opens the form filled in; nothing is saved until you click Save effect.</p>}
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

function DraftCard({ c, onUse, onSkip }: { c: Candidate; onUse: () => void; onSkip: () => void }) {
  const n = (v: number | null) => (v === null ? <span className="muted">?</span> : String(v));
  return (
    <div className={"draft " + c.confidence}>
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
      <div className="row mt" style={{ gap: 8 }}>
        <button className="primary" onClick={onUse}>Use this row</button>
        <button onClick={onSkip}>Skip</button>
      </div>
    </div>
  );
}
