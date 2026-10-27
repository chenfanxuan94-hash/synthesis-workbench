"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Help from "./Help";
import EffectForm, { type Selection } from "./EffectForm";
import {
  saveScreening, resolveConflict, saveCoding, markCodingFinal,
  verifyEffect, deleteEffect, updatePaper, deletePaper, signedUpload, finalizeUpload, reExtractText,
} from "@/lib/actions";
import { paperStatus, currentStage, STATUS_LABEL } from "@/lib/status";
import {
  EXCLUSION_REASONS, STUDY_DESIGNS, TARGETING_LEVELS, CULTURAL_ADAPTATION, ADAPTATION_DEPTH,
  DELIVERY_AGENTS, RISK_OF_BIAS, SETTINGS, REPORTING_LEVELS, MEASURE_VALIDATION,
  OUTCOME_FAMILIES, GROUP_DIMENSIONS, TIERS, SCREENERS_REQUIRED,
} from "@/lib/config";
import type { Coding, Decision, Effect, Member, Paper, Screening, Stage } from "@/lib/types";

type Props = {
  paper: Paper;
  me: Member;
  members: Member[];
  screenings: Screening[];
  codings: Coding[];
  effects: Effect[];
};

type PanelTab = "screen" | "code" | "effects" | "info";

export default function Workspace({ paper, me, members, screenings, codings, effects }: Props) {
  const [viewer, setViewer] = useState<"pdf" | "text">(paper.pdf_path ? "pdf" : "text");
  const [tab, setTab] = useState<PanelTab>("screen");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [find, setFind] = useState("");
  const textRef = useRef<HTMLDivElement>(null);
  const status = paperStatus(paper, screenings);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "?";

  function onMouseUp() {
    const sel = window.getSelection();
    let text = sel?.toString().trim() || "";
    text = text.replace(/^Page \d+\s*/gm, "").trim();
    if (!text || !textRef.current) return;
    let node: Node | null = sel!.anchorNode;
    let page: number | null = null;
    while (node && node !== textRef.current) {
      if (node instanceof HTMLElement && node.dataset.page) { page = Number(node.dataset.page); break; }
      node = node.parentNode;
    }
    setSelection({ text, page });
    if (tab !== "effects") setTab("effects");
  }

  const pages = paper.pages || [];
  const q = find.trim().toLowerCase();

  return (
    <div className="split">
      <div className="pane left">
        <div className="head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="tabs" style={{ borderBottom: "none" }}>
            <button className={viewer === "pdf" ? "on" : ""} onClick={() => setViewer("pdf")} disabled={!paper.pdf_path}>PDF</button>
            <button className={viewer === "text" ? "on" : ""} onClick={() => setViewer("text")}>Text</button>
          </div>
          <Help text="PDF shows the file in the browser's own viewer. Text shows the extracted text by page; select any passage there and it is offered to the Effects form as the verbatim source, with the numbers it contains ready to drop into fields." />
          {viewer === "text" && (
            <input type="search" placeholder="Find in text" value={find} onChange={(e) => setFind(e.target.value)} style={{ marginLeft: "auto", width: 220 }} />
          )}
        </div>
        <div className={"body" + (viewer === "pdf" ? " noPad" : "")}>
          {viewer === "pdf" ? (
            paper.pdf_path ? <iframe className="pdf" src={`/api/pdf/${paper.id}`} title="PDF" /> : <p style={{ padding: 14 }}>No PDF attached. Use the Info tab to upload one.</p>
          ) : (
            <div className="pages" ref={textRef} onMouseUp={onMouseUp}>
              {pages.length === 0 && <p>No extracted text. {paper.pdf_path ? "Try re-extracting from the Info tab; scanned PDFs have no text layer." : "Attach a PDF from the Info tab."}</p>}
              {pages.map((t, i) => {
                const show = !q || t.toLowerCase().includes(q);
                if (!show) return null;
                return (
                  <div className="page" key={i} data-page={i + 1}>
                    <div className="pn">Page {i + 1}</div>
                    {q ? highlight(t, q) : t}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="pane">
        <div className="head">
          <div><b>{paper.title || "(untitled)"}</b></div>
          <div>{paper.first_author ? `${paper.first_author} ` : ""}{paper.year ?? ""}{paper.journal ? ` - ${paper.journal}` : ""} &nbsp; Status: <b>{STATUS_LABEL[status]}</b></div>
          <div className="tabs mt">
            {(["screen", "code", "effects", "info"] as PanelTab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "screen" ? "Screen" : t === "code" ? "Code" : t === "effects" ? `Effects (${effects.length})` : "Info"}
              </button>
            ))}
          </div>
        </div>
        <div className="body">
          {tab === "screen" && <ScreenTab paper={paper} me={me} members={members} screenings={screenings} status={status} />}
          {tab === "code" && <CodeTab paper={paper} me={me} members={members} codings={codings} />}
          {tab === "effects" && (
            <EffectsTab paper={paper} me={me} effects={effects} selection={selection} clearSelection={() => setSelection(null)} nameOf={nameOf} />
          )}
          {tab === "info" && <InfoTab paper={paper} />}
        </div>
      </div>
    </div>
  );
}

function highlight(text: string, q: string) {
  const parts: React.ReactNode[] = [];
  let i = 0;
  const lower = text.toLowerCase();
  let idx = lower.indexOf(q);
  let k = 0;
  while (idx >= 0) {
    parts.push(text.slice(i, idx));
    parts.push(<mark key={k++} style={{ background: "#000", color: "#fff" }}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  parts.push(text.slice(i));
  return parts;
}

// ---------------- Screen ----------------

function ScreenTab({ paper, me, members, screenings, status }: { paper: Paper; me: Member; members: Member[]; screenings: Screening[]; status: ReturnType<typeof paperStatus> }) {
  const stage = currentStage(status);
  const stages: Stage[] = stage === "fulltext" ? ["abstract", "fulltext"] : ["abstract"];
  const resolved = status === "included" || status === "excluded";
  return (
    <div className="stack">
      {paper.abstract && (
        <details open={stage === "abstract"}>
          <summary><b>Abstract</b></summary>
          <p className="mt">{paper.abstract}</p>
        </details>
      )}
      {(resolved ? (["abstract", "fulltext"] as Stage[]) : stages).map((s) => (
        <StageBlock key={s} paper={paper} me={me} members={members} screenings={screenings.filter((x) => x.stage === s)} stage={s}
          active={s === stage} conflict={status === `${s}_conflict`} override={s === "abstract" ? paper.abstract_override : paper.fulltext_override} />
      ))}
      {resolved && <p><b>{STATUS_LABEL[status]}.</b>{paper.override_reason ? ` Resolution note: ${paper.override_reason}` : ""}</p>}
    </div>
  );
}

function StageBlock({ paper, me, members, screenings, stage, active, conflict, override }: {
  paper: Paper; me: Member; members: Member[]; screenings: Screening[]; stage: Stage; active: boolean; conflict: boolean; override: string | null;
}) {
  const mine = screenings.find((s) => s.member_id === me.id);
  const [decision, setDecision] = useState<Decision | "">(mine?.decision || "");
  const [reason, setReason] = useState(mine?.reason || "");
  const [notes, setNotes] = useState(mine?.notes || "");
  const [resolution, setResolution] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const others = screenings.filter((s) => s.member_id !== me.id);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "?";

  function save() {
    if (!decision) return;
    start(async () => {
      await saveScreening(paper.id, stage, decision, decision === "exclude" ? reason : "", notes);
      router.refresh();
    });
  }
  function resolve(d: "include" | "exclude") {
    start(async () => {
      await resolveConflict(paper.id, stage, d, resolution);
      router.refresh();
    });
  }

  return (
    <fieldset>
      <legend>
        {stage === "abstract" ? "Title and abstract screening" : "Full-text screening"}
        <Help text={stage === "abstract"
          ? "Decide from the title and abstract only. Include if the paper could be a United States evaluation of a school-based behavioral health program for youth ages 5 to 25 with a comparison condition. When in doubt, include; full-text screening is where the eligibility criteria are applied strictly."
          : "Apply every eligibility criterion to the full text: United States; school-based; behavioral health program; RCT or strong quasi-experiment; ages 5 to 25; at least one eligible outcome. Lack of results by race or income is not an exclusion reason - those papers stay in for the reporting audit and are recorded in Code under reporting level."} />
      </legend>
      {active && !conflict && (
        <div className="stack">
          <div>
            {(["include", "exclude", "unsure"] as Decision[]).map((d) => (
              <label key={d} className="inline">
                <input type="radio" name={`dec-${stage}`} checked={decision === d} onChange={() => setDecision(d)} />
                {d === "include" ? "Include" : d === "exclude" ? "Exclude" : "Unsure"}
              </label>
            ))}
          </div>
          {decision === "exclude" && (
            <div>
              <label className="block">Reason</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%" }}>
                <option value="">Select a reason</option>
                {EXCLUSION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the other reviewer should know" />
          </div>
          <div>
            <button className="primary" onClick={save} disabled={pending || !decision || (decision === "exclude" && !reason)}>
              {mine ? "Update my decision" : "Save my decision"}
            </button>
            {mine && <span style={{ marginLeft: 10 }}>Saved {new Date(mine.updated_at).toLocaleString()}</span>}
          </div>
        </div>
      )}
      {!active && mine && <p>Your decision: <b>{mine.decision}</b>{mine.reason ? ` - ${mine.reason}` : ""}{mine.notes ? ` (${mine.notes})` : ""}</p>}
      {(mine || !active) ? (
        <div className="mt">
          <b>Other reviewers</b>
          <Help text="Shown only after you have saved your own decision, so decisions stay independent." />
          {others.length === 0 ? <p>None yet.</p> : (
            <table className="grid mt">
              <tbody>
                {others.map((s) => (
                  <tr key={s.id}><td>{nameOf(s.member_id)}</td><td><b>{s.decision}</b>{s.reason ? ` - ${s.reason}` : ""}</td><td>{s.notes || ""}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          {active && !conflict && mine && screenings.length < SCREENERS_REQUIRED && <p className="mt">Waiting for {SCREENERS_REQUIRED - screenings.length} more decision(s).</p>}
        </div>
      ) : (
        active && <p className="mt">Other reviewers' decisions appear after you save yours.</p>
      )}
      {conflict && (
        <div className="mt box">
          <b>Conflict</b>
          <Help text="Reviewers disagree or someone was unsure. Discuss, then record the agreed decision here. The resolution is kept with the paper along with who recorded it." />
          <table className="grid mt">
            <tbody>
              {screenings.map((s) => (
                <tr key={s.id}><td>{nameOf(s.member_id)}</td><td><b>{s.decision}</b>{s.reason ? ` - ${s.reason}` : ""}</td><td>{s.notes || ""}</td></tr>
              ))}
            </tbody>
          </table>
          <label className="block">Resolution note</label>
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} />
          <div className="mt">
            <button className="primary" onClick={() => resolve("include")} disabled={pending}>Agreed: include</button>{" "}
            <button onClick={() => resolve("exclude")} disabled={pending}>Agreed: exclude</button>
          </div>
        </div>
      )}
      {override && <p className="mt">Resolved by discussion as <b>{override}</b>.</p>}
    </fieldset>
  );
}

// ---------------- Code ----------------

const CODING_FIELDS: { key: keyof Coding; label: string; help: string; type: "select" | "number" | "bool" | "text"; options?: string[] }[] = [
  { key: "study_design", label: "Study design", type: "select", options: STUDY_DESIGNS, help: "RCT, cluster RCT, or a quasi-experiment with a comparison group and some control for selection (matching, baseline equivalence)." },
  { key: "targeting_level", label: "Targeting level", type: "select", options: TARGETING_LEVELS, help: "Universal: delivered to everyone in a classroom or school. Selective: delivered to a subgroup at elevated risk by group membership. Indicated: delivered to individuals screened for elevated symptoms or behavior." },
  { key: "cultural_adaptation", label: "Cultural adaptation", type: "select", options: CULTURAL_ADAPTATION, help: "Yes when the authors describe deliberate changes to language, examples, values, persons, content, or delivery to fit a specific racial, ethnic, or cultural group. Generic 'culturally sensitive' claims without described changes are No." },
  { key: "adaptation_depth", label: "Adaptation depth", type: "select", options: ADAPTATION_DEPTH, help: "Surface: language, images, examples. Deep: values, goals, methods, context (Bernal's dimensions). Only code when adaptation is Yes." },
  { key: "delivery_agent", label: "Delivery agent", type: "select", options: DELIVERY_AGENTS, help: "Who delivered the program to students." },
  { key: "dosage_sessions", label: "Sessions", type: "number", help: "Planned number of sessions. Leave blank if not reported." },
  { key: "dosage_weeks", label: "Duration (weeks)", type: "number", help: "Planned program length in weeks." },
  { key: "risk_of_bias", label: "Risk of bias", type: "select", options: RISK_OF_BIAS, help: "Overall judgment for the comparison used here. Record the basis in notes." },
  { key: "setting", label: "School level", type: "select", options: SETTINGS, help: "Grade band of the sample." },
  { key: "age_min", label: "Age min", type: "number", help: "Youngest participants, in years." },
  { key: "age_max", label: "Age max", type: "number", help: "Oldest participants, in years." },
  { key: "n_total", label: "N analyzed", type: "number", help: "Total sample in the analysis the effects come from." },
  { key: "pct_black", label: "% Black", type: "number", help: "Sample composition. Needed for the composition-based fallback analysis when no group-specific results exist." },
  { key: "pct_latinx", label: "% Latinx", type: "number", help: "Sample composition." },
  { key: "pct_low_income", label: "% lower-income", type: "number", help: "Share of the sample that is lower-income, usually free or reduced-price lunch eligibility." },
  { key: "single_group_sample", label: "Single-group sample", type: "bool", help: "Yes when the sample is (nearly) all one group, for example all Black students, so no within-study gap can be computed. These papers enter the benchmarking analysis instead." },
  { key: "reporting_level", label: "Reporting level", type: "select", options: REPORTING_LEVELS, help: "The audit variable for Research Question 3: the most detailed form in which results by race, ethnicity, or income appear anywhere in the paper, including appendices." },
  { key: "measures_validated_by_group", label: "Measures validated by group", type: "select", options: MEASURE_VALIDATION, help: "Whether the outcome measures have reported validation or invariance evidence for each group being compared." },
];

function CodeTab({ paper, me, members, codings }: { paper: Paper; me: Member; members: Member[]; codings: Coding[] }) {
  const mine = codings.find((c) => c.coder_id === me.id);
  const init: Record<string, any> = {};
  for (const f of CODING_FIELDS) init[f.key] = mine ? (mine as any)[f.key] ?? "" : "";
  init.notes = mine?.notes || "";
  const [v, setV] = useState<Record<string, any>>(init);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "?";

  function save() {
    start(async () => { await saveCoding(paper.id, v); router.refresh(); });
  }
  function makeFinal(id: string) {
    start(async () => { await markCodingFinal(paper.id, id); router.refresh(); });
  }
  const others = codings.filter((c) => c.coder_id !== me.id);

  return (
    <div className="stack">
      <p>
        Design features for this paper, coded by you.
        <Help text="Each coder enters their own coding. When two codings exist they are compared below; disagreements are marked. Mark one coding as final after discussion; the dataset uses the final coding." />
      </p>
      <div className="row">
        {CODING_FIELDS.map((f) => (
          <div key={f.key} style={{ minWidth: f.type === "number" ? 120 : 230 }}>
            <label>{f.label}<Help text={f.help} /></label>
            {f.type === "select" && (
              <select value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)}>
                <option value=""></option>
                {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {f.type === "number" && <input type="number" step="any" value={v[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />}
            {f.type === "bool" && (
              <select value={v[f.key] === true ? "true" : v[f.key] === false ? "false" : ""} onChange={(e) => set(f.key, e.target.value === "" ? "" : e.target.value === "true")}>
                <option value=""></option><option value="true">Yes</option><option value="false">No</option>
              </select>
            )}
          </div>
        ))}
      </div>
      <div>
        <label className="block">Coding notes</label>
        <textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Basis for judgments, page references" />
      </div>
      <div>
        <button className="primary" onClick={save} disabled={pending}>{mine ? "Update my coding" : "Save my coding"}</button>
        {mine && !mine.is_final && <button style={{ marginLeft: 8 }} onClick={() => makeFinal(mine.id)} disabled={pending}>Mark mine as final</button>}
        {mine?.is_final && <span style={{ marginLeft: 10 }}><b>This is the final coding.</b></span>}
      </div>

      {codings.length > 0 && (
        <div>
          <h3>All codings{codings.length > 1 ? " and disagreements" : ""}</h3>
          <table className="grid">
            <thead>
              <tr><th>Field</th>{codings.map((c) => <th key={c.id}>{nameOf(c.coder_id)}{c.is_final ? " (final)" : ""}</th>)}<th></th></tr>
            </thead>
            <tbody>
              {CODING_FIELDS.map((f) => {
                const vals = codings.map((c) => String((c as any)[f.key] ?? ""));
                const differ = new Set(vals).size > 1;
                return (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    {vals.map((x, i) => <td key={i}>{x}</td>)}
                    <td className="mark">{differ ? "differs" : ""}</td>
                  </tr>
                );
              })}
              <tr><td>Notes</td>{codings.map((c) => <td key={c.id}>{c.notes || ""}</td>)}<td></td></tr>
            </tbody>
          </table>
          {others.map((c) => !c.is_final && (
            <button key={c.id} className="small mt" onClick={() => makeFinal(c.id)} disabled={pending}>Mark {nameOf(c.coder_id)}'s coding as final</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Effects ----------------

function EffectsTab({ paper, me, effects, selection, clearSelection, nameOf }: {
  paper: Paper; me: Member; effects: Effect[]; selection: Selection | null; clearSelection: () => void; nameOf: (id: string | null) => string;
}) {
  const [editing, setEditing] = useState<Effect | null | "new">(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => { if (selection && editing === null) setEditing("new"); }, [selection]); // eslint-disable-line

  function verify(e: Effect) {
    start(async () => { await verifyEffect(paper.id, e.id, !e.verified_by); router.refresh(); });
  }
  function remove(e: Effect) {
    if (!confirm("Delete this effect row?")) return;
    start(async () => { await deleteEffect(paper.id, e.id); router.refresh(); });
  }
  const fmt = (v: number | null) => (v === null ? "" : v.toFixed(3));

  return (
    <div className="stack">
      <p>
        One row per outcome, group contrast and timepoint.
        <Help text="Enter what the paper reports for each group in each arm. The app computes the group-specific effects and the gap change (delta): positive delta means the marginalized group benefited more, so the gap narrowed. A second person verifies each row against the paper before it counts in the final dataset." />
      </p>
      {editing === null && (
        <div><button className="primary" onClick={() => setEditing("new")}>Add effect</button></div>
      )}
      {editing !== null && (
        <EffectForm
          paperId={paper.id}
          effect={editing === "new" ? null : editing}
          selection={selection}
          clearSelection={clearSelection}
          onDone={() => { setEditing(null); clearSelection(); router.refresh(); }}
          onCancel={() => { setEditing(null); clearSelection(); }}
        />
      )}
      {effects.length > 0 && (
        <table className="grid">
          <thead>
            <tr><th>Outcome</th><th>Groups</th><th>Tier</th><th>delta<Help text="Gap change on the SMD scale, with its standard error. Positive = gap narrowed." /></th><th>Source</th><th>By</th><th></th></tr>
          </thead>
          <tbody>
            {effects.map((e) => (
              <tr key={e.id}>
                <td>{OUTCOME_FAMILIES[e.outcome_family]}<br />{e.outcome_name || ""}{e.timepoint ? ` (${e.timepoint})` : ""}</td>
                <td>{GROUP_DIMENSIONS[e.group_dimension]}{e.group_dimension === "other" ? `: ${e.marginalized_group} vs ${e.comparison_group}` : ""}</td>
                <td>{e.tier}</td>
                <td className="nowrap">{e.delta === null ? (e.compute_note || "not computed") : `${fmt(e.delta)} (${fmt(e.var_delta !== null ? Math.sqrt(e.var_delta) : null)})`}</td>
                <td>{e.page ? `p. ${e.page} ` : ""}{e.source_label || ""}</td>
                <td className="nowrap">{nameOf(e.entered_by)}{e.verified_by ? <><br />verified by {nameOf(e.verified_by)}</> : ""}</td>
                <td className="nowrap">
                  <button className="small" onClick={() => setEditing(e)} disabled={pending}>Edit</button>{" "}
                  {e.entered_by !== me.id && <button className="small" onClick={() => verify(e)} disabled={pending}>{e.verified_by ? "Unverify" : "Verify"}</button>}{" "}
                  <button className="small" onClick={() => remove(e)} disabled={pending}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------- Info ----------------

function InfoTab({ paper }: { paper: Paper }) {
  const [v, setV] = useState({
    title: paper.title || "", authors: paper.authors || "", year: paper.year, journal: paper.journal || "",
    doi: paper.doi || "", abstract: paper.abstract || "", source: paper.source || "",
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));

  function save() {
    start(async () => { await updatePaper(paper.id, v); setMsg("Saved."); router.refresh(); });
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setMsg("Uploading");
    const { path, url } = await signedUpload(file.name);
    const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
    if (!res.ok) { setMsg("Upload failed: " + res.status); return; }
    setMsg("Extracting text");
    await finalizeUpload(path, file.name, paper.id);
    setMsg("PDF attached.");
    router.refresh();
  }
  function reextract() {
    start(async () => { await reExtractText(paper.id); setMsg("Text re-extracted."); router.refresh(); });
  }
  function remove() {
    if (!confirm("Delete this paper and everything recorded for it?")) return;
    start(async () => { await deletePaper(paper.id); });
  }

  return (
    <div className="stack">
      <div><label className="block">Title</label><input value={v.title} onChange={(e) => set("title", e.target.value)} style={{ width: "100%" }} /></div>
      <div><label className="block">Authors</label><input value={v.authors} onChange={(e) => set("authors", e.target.value)} style={{ width: "100%" }} /></div>
      <div className="row">
        <div><label>Year</label><input type="number" value={v.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><label>Journal</label><input value={v.journal} onChange={(e) => set("journal", e.target.value)} style={{ width: 260 }} /></div>
        <div><label>DOI</label><input value={v.doi} onChange={(e) => set("doi", e.target.value)} style={{ width: 220 }} /></div>
        <div><label>Source</label><input value={v.source} onChange={(e) => set("source", e.target.value)} style={{ width: 220 }} /></div>
      </div>
      <div><label className="block">Abstract</label><textarea value={v.abstract} onChange={(e) => set("abstract", e.target.value)} style={{ minHeight: 140 }} /></div>
      <div><button className="primary" onClick={save} disabled={pending}>Save details</button> {msg && <span style={{ marginLeft: 10 }}>{msg}</span>}</div>
      <fieldset>
        <legend>PDF</legend>
        <p>{paper.pdf_path ? `Attached: ${paper.pdf_path}` : "No PDF attached."}</p>
        <div className="row">
          <div><label>{paper.pdf_path ? "Replace PDF" : "Upload PDF"}</label><input type="file" accept="application/pdf" onChange={(e) => upload(e.target.files?.[0])} /></div>
          {paper.pdf_path && <button onClick={reextract} disabled={pending}>Re-extract text</button>}
        </div>
      </fieldset>
      <div><button onClick={remove} disabled={pending}>Delete paper</button></div>
    </div>
  );
}
