"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Help from "./Help";
import Instructions from "./Instructions";
import PdfFrame from "./PdfFrame";
import DropZone from "./DropZone";
import CodeTab from "./CodeTab";
import EffectsTab from "./EffectsTab";
import type { Selection } from "./EffectForm";
import { saveVote, setPiDecision, updatePaper, deletePaper, signedUpload, finalizeUpload, reExtractText } from "@/lib/actions";
import { standing, explain, needsMyVote, STATUS_LABEL, RULE } from "@/lib/status";
import { EXCLUSION_REASONS, VOTES_REQUIRED } from "@/lib/config";
import { TASK_STEP, type Task } from "@/lib/steps";
import { when, describeAction } from "@/lib/format";
import Ago from "./Ago";
import type { Activity, Coding, Decision, Effect, Member, Paper, Standing, Vote } from "@/lib/types";

export type PanelTab = "overview" | "vote" | "code" | "effects" | "edit";

type Props = {
  paper: Paper;
  me: Member;
  members: Member[];
  votes: Vote[];
  coding: Coding | null;
  effects: Effect[];
  activity: Activity[];
  task: Task | null;
  left: number | null;
  initialTab: PanelTab | null;
  blind: boolean;
  aiReady: boolean;
};

export default function Workspace({ paper, me, members, votes, coding, effects, activity, task, left, initialTab, blind, aiReady }: Props) {
  const s = standing(paper, votes);
  const [viewer, setViewer] = useState<"pdf" | "text">(paper.pdf_path ? "pdf" : "text");
  const [tab, setTab] = useState<PanelTab>(() => initialTab || (task === "vote" ? "vote" : task === "code" ? "code" : "overview"));
  const [selection, setSelection] = useState<Selection | null>(null);
  const [find, setFind] = useState("");
  const textRef = useRef<HTMLDivElement>(null);
  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name || "someone";

  function onMouseUp() {
    if (tab !== "effects") return;
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
  }

  const pages = paper.pages || [];
  const q = find.trim().toLowerCase();
  const step = task ? TASK_STEP[task] : null;
  // With no PDF and no text, the left side shows the title and abstract for reading.
  const abstractLeft = !paper.pdf_path && pages.length === 0;

  const noPdf = (
    <div style={{ padding: 16 }}>
      <div className="note info">
        <b>No PDF for this paper yet.</b>{" "}
        {tab === "vote" ? "You can vote from the title and abstract. " : "Coding needs the PDF. "}
        To add it, find the paper (Google Scholar, the university library, or ask a teammate), then upload it in the Edit details tab.
        <div className="mt"><button className="primary small" onClick={() => setTab("edit")}>Open Edit details</button></div>
      </div>
    </div>
  );

  const leftEmpty = (
    <>
      <div className="abs-left">
        <div className="t">{paper.title || "(untitled)"}</div>
        <div className="a">{paper.authors || ""}{paper.year ? ` (${paper.year})` : ""}{paper.journal ? `. ${paper.journal}` : ""}</div>
        {paper.abstract
          ? <div className="txt">{paper.abstract}</div>
          : <div className="note warn">This record has no abstract. Decide from the title, or look the paper up online and paste its abstract in the Edit details tab.</div>}
      </div>
      {noPdf}
    </>
  );

  // While working through a queue, only that step's tabs are shown. Opened from the list, every tab is.
  const tabs: PanelTab[] = task === "vote" ? ["vote", "edit"] : task === "code" ? ["code", "effects", "edit"] : ["overview", "vote", "code", "effects", "edit"];
  if (!tabs.includes(tab)) tabs.unshift(tab);
  const label = (t: PanelTab) =>
    t === "overview" ? "Overview" : t === "vote" ? "Vote" : t === "code" ? "Code" : t === "effects" ? `Effect sizes${effects.length ? ` (${effects.length})` : ""}` : "Edit details";

  const statusText = s.byPI ? (s.status === "approved" ? "Approved by decision" : "Rejected by decision") : s.status === "needs_votes" ? `Needs votes ${s.include + s.exclude}/${VOTES_REQUIRED}` : STATUS_LABEL[s.status];

  return (
    <div className="workspace">
      <div className="pane left">
        <div className="head">
          <div className="tabs">
            <button className={viewer === "pdf" ? "on" : ""} onClick={() => setViewer("pdf")}>PDF</button>
            <button className={viewer === "text" ? "on" : ""} onClick={() => setViewer("text")}>Text</button>
          </div>
          <Help text="PDF shows the paper as it was published. Text shows the same words as plain text, page by page. While the Effect sizes tab is open, select a sentence in the Text view and its numbers appear as buttons you can click into the form." />
          {viewer === "text" && pages.length > 0 && (
            <input type="search" placeholder="Find a word in the paper" value={find} onChange={(e) => setFind(e.target.value)} style={{ marginLeft: "auto", width: 240 }} />
          )}
          {viewer === "pdf" && paper.pdf_path && (
            <a className="newtab" href={`/api/pdf/${paper.id}`} target="_blank" rel="noreferrer">Open in new tab &#8599;</a>
          )}
        </div>
        <div className={"body" + (viewer === "pdf" && paper.pdf_path ? " noPad" : "")} style={viewer === "pdf" && !paper.pdf_path ? { padding: 0 } : undefined}>
          {viewer === "pdf" ? (
            paper.pdf_path ? <PdfFrame id={paper.id} version={paper.pdf_path} /> : leftEmpty
          ) : abstractLeft ? (
            leftEmpty
          ) : (
            <div className="pages" ref={textRef} onMouseUp={onMouseUp}>
              {pages.length === 0 && (
                <div className="note warn">
                  No text could be read from this PDF. It is probably a scanned image. Read it in the PDF view, and use a screenshot for the AI drafts.
                </div>
              )}
              {pages.map((t, i) => {
                if (q && !t.toLowerCase().includes(q)) return null;
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
          <div className="topline">
            <Link href="/" className="btn primary homebtn"><span aria-hidden="true">&larr;</span> All papers</Link>
            {step && <Link href={`/work/${task}?after=${paper.id}`} className="skip">Skip this paper</Link>}
            <span className="who">{me.name}</span>
          </div>
          {step ? (
            <div className="eyebrow">
              Step {step.n} &middot; {step.title}
              {typeof left === "number" && <> &middot; {left === 0 ? "none left for you" : `${left} left for you`}</>}
            </div>
          ) : (
            <div className="eyebrow"><span className={"pill " + s.status}>{statusText}</span></div>
          )}
          <div className="title">{paper.title || "(untitled)"}</div>
          <div className="meta">{[paper.first_author, paper.year, paper.journal].filter(Boolean).join(" - ")}</div>
          <div className="tabs mt">
            {tabs.map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{label(t)}</button>
            ))}
          </div>
        </div>
        <div className="body">
          {tab === "overview" && <OverviewTab paper={paper} me={me} members={members} votes={votes} s={s} coding={coding} effects={effects} activity={activity} blind={blind} go={setTab} />}
          {tab === "vote" && <VoteTab paper={paper} me={me} members={members} votes={votes} s={s} task={task} blind={blind} abstractLeft={abstractLeft} goEdit={() => setTab("edit")} />}
          {tab === "code" && <CodeTab paper={paper} me={me} members={members} coding={coding} effects={effects} s={s} task={task} aiReady={aiReady} goEffects={() => setTab("effects")} />}
          {tab === "effects" && (
            <EffectsTab paper={paper} me={me} members={members} effects={effects} coding={coding} s={s} task={task} aiReady={aiReady}
              goCode={() => setTab("code")} selection={selection} clearSelection={() => setSelection(null)} showText={() => setViewer("text")} />
          )}
          {tab === "edit" && <EditTab paper={paper} me={me} members={members} s={s} onAttached={() => setViewer("pdf")} />}
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
    parts.push(<mark key={k++}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  parts.push(text.slice(i));
  return parts;
}

const voteWord = (d: string) => (d === "include" ? "Include" : d === "exclude" ? "Exclude" : "Not sure");

// ---------------- Overview ----------------

function OverviewTab({ paper, me, members, votes, s, coding, effects, activity, blind, go }: {
  paper: Paper; me: Member; members: Member[]; votes: Vote[]; s: Standing; coding: Coding | null; effects: Effect[]; activity: Activity[]; blind: boolean; go: (t: PanelTab) => void;
}) {
  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name || "someone";
  const iVoted = votes.some((v) => v.member_id === me.id);
  const hideOthers = blind && !iVoted;
  const names = votes.map((v) => `${nameOf(v.member_id)} ${voteWord(v.decision)}`);
  const mine = needsMyVote(s, votes, me.id);
  return (
    <div className="stack">
      <div className={"statusbox " + s.status}>
        <div className="big">{s.byPI ? (s.status === "approved" ? "Approved by a team decision" : "Rejected by a team decision") : STATUS_LABEL[s.status]}</div>
        <div>{explain(s, hideOthers ? [] : names)}{s.byPI && paper.pi_note ? ` Note: ${paper.pi_note}` : ""}</div>
        {mine && <div className="mt"><button className="primary" onClick={() => go("vote")}>Cast your vote &rarr;</button></div>}
      </div>

      <div>
        <h3 style={{ marginTop: 0 }}>Votes <Help text={RULE} /></h3>
        <table className="grid">
          <tbody>
            {members.map((m) => {
              const v = votes.find((x) => x.member_id === m.id);
              const hidden = hideOthers && v && m.id !== me.id;
              return (
                <tr key={m.id}>
                  <td className="nowrap"><b>{m.name}</b>{m.id === me.id ? " (you)" : ""}</td>
                  <td className="nowrap">{!v ? <span className="muted">has not voted</span> : hidden ? "voted" : <span className={"pill vote-" + v.decision}>{voteWord(v.decision)}</span>}</td>
                  <td>{v && !hidden ? [v.reason, v.notes].filter(Boolean).join(" - ") : ""}</td>
                  <td className="nowrap muted">{v ? <Ago iso={v.updated_at} /> : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hideOthers && <p className="muted" style={{ marginTop: 6 }}>Other people&apos;s decisions appear after you save yours.</p>}
      </div>

      <div>
        <h3>Coding</h3>
        <table className="grid">
          <tbody>
            <tr>
              <td className="nowrap"><b>Study features</b></td>
              <td>{coding ? <>saved by {nameOf(coding.updated_by || coding.coder_id)} <Ago iso={coding.updated_at} /></> : <span className="muted">not started</span>}</td>
              <td className="nowrap"><button className="small" onClick={() => go("code")}>Open</button></td>
            </tr>
            <tr>
              <td className="nowrap"><b>Effect sizes</b></td>
              <td>{effects.length === 0 ? <span className="muted">no rows yet</span> : <>{effects.length} {effects.length === 1 ? "row" : "rows"}, last saved by {nameOf(lastEditor(effects))} <Ago iso={lastTime(effects)} /></>}</td>
              <td className="nowrap"><button className="small" onClick={() => go("effects")}>Open</button></td>
            </tr>
            <tr>
              <td className="nowrap"><b>Done?</b></td>
              <td>{coding?.done ? <span className="pill done">done - marked by {nameOf(coding.updated_by || coding.coder_id)}</span> : <span className="muted">not yet</span>}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h3>History <Help text="Everything anyone did to this paper, newest first." /></h3>
        {activity.length === 0 ? <p className="muted">Nothing recorded yet.</p> : (
          <ul className="history">
            {activity.map((a) => (
              <li key={a.id}><b>{nameOf(a.member_id)}</b> {describeAction(a.action, a.detail)} <span className="muted">&middot; {when(a.created_at)}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function lastEditor(effects: Effect[]): string | null {
  let best: Effect | null = null;
  for (const e of effects) if (!best || (e.updated_at || e.created_at) > (best.updated_at || best.created_at)) best = e;
  return best ? best.updated_by || best.entered_by : null;
}
function lastTime(effects: Effect[]): string | null {
  let t: string | null = null;
  for (const e of effects) { const u = e.updated_at || e.created_at; if (!t || u > t) t = u; }
  return t;
}

// ---------------- Vote ----------------

const CRITERIA: { q: string; hint: string; reason: string }[] = [
  { q: "Was the study done in the United States?", hint: "Look for a city, state, or school district name.", reason: EXCLUSION_REASONS[0] },
  { q: "Was the program delivered in or through a school or college?", hint: "Kindergarten through college. Programs run only in clinics or community centers do not count.", reason: EXCLUSION_REASONS[1] },
  { q: "Is the program about mental health, emotions, or behavior?", hint: "Counseling, therapy, social-emotional learning, mindfulness, and behavior or discipline programs count. Purely academic or physical health programs do not.", reason: EXCLUSION_REASONS[2] },
  { q: "Was the program group compared with a control group that did not get it?", hint: "Look for: randomized, control group, comparison group, wait-list, quasi-experimental. One group measured before and after does not count.", reason: EXCLUSION_REASONS[3] },
  { q: "Were the students between 5 and 25 years old?", hint: "Kindergarten through college age.", reason: EXCLUSION_REASONS[4] },
  { q: "Did it measure service use, mental health or behavior, or discipline or attendance?", hint: "For example sessions attended, depression or anxiety scores, behavior ratings, suspensions, absences.", reason: EXCLUSION_REASONS[5] },
  { q: "Does the paper report its own new results?", hint: "Reviews, commentaries, and study protocols without results do not count.", reason: EXCLUSION_REASONS[6] },
];

type Answer = "yes" | "no" | "maybe" | null;

function Checklist({ onSuggest }: { onSuggest: (d: Decision, reason: string) => void }) {
  const [answers, setAnswers] = useState<Answer[]>(CRITERIA.map(() => null));
  const [msg, setMsg] = useState("");

  function answer(i: number, a: Answer) {
    const next = answers.map((x, j) => (j === i ? a : x));
    setAnswers(next);
    const firstNo = next.findIndex((x) => x === "no");
    if (firstNo >= 0) {
      onSuggest("exclude", CRITERIA[firstNo].reason);
      setMsg(`Suggested: Exclude, because "${CRITERIA[firstNo].reason}".`);
    } else if (next.every((x) => x === "yes")) {
      onSuggest("include", "");
      setMsg("Suggested: Include. Every answer is Yes.");
    } else if (next.every((x) => x !== null)) {
      onSuggest("include", "");
      setMsg("Suggested: Include. Nothing says No, and when in doubt we include; say in the note what you could not tell, so the second voter can check it.");
    } else {
      setMsg("");
    }
  }

  return (
    <div>
      <b>Checklist</b>
      <Help text="Answer each question from what you can read. The checklist only suggests a vote; it is not saved. You make the final choice with the buttons below it." />
      <table className="check">
        <tbody>
          {CRITERIA.map((c, i) => (
            <tr key={i}>
              <td className="q">{i + 1}. {c.q}<Help text={c.hint} /></td>
              <td>
                <div className="yn">
                  <button type="button" className={"yes" + (answers[i] === "yes" ? " on" : "")} onClick={() => answer(i, "yes")}>Yes</button>
                  <button type="button" className={"no" + (answers[i] === "no" ? " on" : "")} onClick={() => answer(i, "no")}>No</button>
                  <button type="button" className={"maybe" + (answers[i] === "maybe" ? " on" : "")} onClick={() => answer(i, "maybe")}>Not sure</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <div className="note info">{msg} You can change it below.</div>}
    </div>
  );
}

function VoteTab({ paper, me, members, votes, s, task, blind, abstractLeft, goEdit }: {
  paper: Paper; me: Member; members: Member[]; votes: Vote[]; s: Standing; task: Task | null; blind: boolean; abstractLeft: boolean; goEdit: () => void;
}) {
  const mine = votes.find((v) => v.member_id === me.id);
  const [decision, setDecision] = useState<Decision | "">(mine?.decision || "");
  const [reason, setReason] = useState(mine?.reason || "");
  const [notes, setNotes] = useState(mine?.notes || "");
  const [err, setErr] = useState("");
  // Once a vote is saved the step shows as a read-only summary; Change my vote reopens the form.
  const [editing, setEditing] = useState(!mine);
  const [pending, start] = useTransition();
  const router = useRouter();
  const others = votes.filter((v) => v.member_id !== me.id);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "someone";
  const next = `/work/vote?after=${paper.id}`;
  const hideOthers = blind && !mine;

  function save() {
    if (!decision) return;
    setErr("");
    start(async () => {
      const r = await saveVote(paper.id, decision, decision === "exclude" ? reason : "", notes);
      if (!r.ok) { setErr(r.error); return; }
      setEditing(false);
      router.refresh();
    });
  }

  const statusLine = s.byPI
    ? `The paper is ${s.status === "approved" ? "approved" : "rejected"} by a recorded team decision.`
    : s.status === "needs_votes" ? `The paper is approved or rejected once ${VOTES_REQUIRED} people have voted.`
    : s.status === "split" ? "Someone voted the other way. Talk it through as a team and record the decision in Edit details."
    : s.status === "approved" ? "The paper is approved." : "The paper is rejected.";

  return (
    <div className="stack">
      {editing && (
        <Instructions id="vote" title="What to do: vote on this paper">
          <ol>
            <li>{abstractLeft ? "Read the title and abstract on the left." : "Read the abstract below, or the paper on the left."}</li>
            <li>Answer the seven checklist questions from what you can read. If it does not say, choose <b>Not sure</b>.</li>
            <li>Look at the suggested vote. Change it if you disagree, and add a note if something was unclear.</li>
            <li>Click <b>Save my vote</b>{task === "vote" ? <>, then <b>Next paper</b></> : ""}.</li>
          </ol>
          <p style={{ margin: 0 }}>{RULE} Every paper stays in All papers whatever you vote, so you can always come back to it.</p>
        </Instructions>
      )}

      {s.byPI && (
        <div className="note info"><b>{s.status === "approved" ? "Approved" : "Rejected"} by a recorded team decision</b>{paper.pi_note ? `: ${paper.pi_note}` : "."} Your vote is still recorded, but the recorded decision stands.</div>
      )}

      {abstractLeft ? null : paper.abstract ? (
        editing
          ? <div className="card"><h3 style={{ marginTop: 0 }}>Abstract</h3><p style={{ margin: 0 }}>{paper.abstract}</p></div>
          : <details className="card"><summary><b>Abstract</b> (click to show)</summary><p className="mt" style={{ marginBottom: 0 }}>{paper.abstract}</p></details>
      ) : editing ? (
        <div className="note warn">
          This record has no abstract. Decide from the PDF or the title, or look the paper up online and paste its abstract in Edit details.
        </div>
      ) : null}

      {mine && !editing ? (
        <div className="votedbox">
          <div className="eyebrow">Your vote</div>
          <div className="big"><span className={"pill vote-" + mine.decision}>{voteWord(mine.decision)}</span>{mine.reason ? <span className="reason"> {mine.reason}</span> : null}</div>
          {mine.notes && <p className="muted" style={{ margin: "6px 0 0" }}>Your note: {mine.notes}</p>}
          <p style={{ margin: "10px 0 0" }}>Saved <Ago iso={mine.updated_at} />. {statusLine}</p>
          <div className="row mt" style={{ alignItems: "center" }}>
            {task === "vote" && <Link className="btn primary big" href={next}>Next paper &rarr;</Link>}
            <button onClick={() => setEditing(true)}>Change my vote</button>
          </div>
        </div>
      ) : (
        <fieldset>
          <legend>{mine ? "Change your vote" : "Your vote"}</legend>
          <div className="stack">
            <Checklist onSuggest={(d, r) => { setDecision(d); setReason(r); }} />
            <div>
              <b>Vote</b>
              <div className="choices mt">
                {(["include", "exclude", "unsure"] as Decision[]).map((d) => (
                  <button key={d} type="button" className={d + (decision === d ? " on" : "")} onClick={() => setDecision(d)}>{voteWord(d)}</button>
                ))}
              </div>
            </div>
            {decision === "exclude" && (
              <div>
                <label className="block">Reason for excluding</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%" }}>
                  <option value="">Choose the first rule the paper fails</option>
                  {EXCLUSION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block">Notes (optional)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the others should know, for example what you could not tell" />
            </div>
            {err && <div className="err">{err}</div>}
            <div className="row" style={{ alignItems: "center" }}>
              <button className="primary big" onClick={save} disabled={pending || !decision || (decision === "exclude" && !reason)}>
                {pending ? "Saving..." : mine ? "Save my new vote" : "Save my vote"}
              </button>
              {mine && <button onClick={() => { setEditing(false); setDecision(mine.decision); setReason(mine.reason || ""); setNotes(mine.notes || ""); }} disabled={pending}>Keep my vote</button>}
              {decision === "exclude" && !reason && <span>Choose a reason to save.</span>}
            </div>
          </div>
        </fieldset>
      )}

      <div>
        <b>Other people&apos;s votes</b>
        {hideOthers ? (
          <p className="muted">Shown after you save your own vote.</p>
        ) : others.length === 0 ? <p className="muted">Nobody else has voted yet.</p> : (
          <table className="grid mt">
            <tbody>
              {others.map((v) => (
                <tr key={v.id}><td className="nowrap"><b>{nameOf(v.member_id)}</b></td><td className="nowrap"><span className={"pill vote-" + v.decision}>{voteWord(v.decision)}</span></td><td>{[v.reason, v.notes].filter(Boolean).join(" - ")}</td><td className="nowrap muted"><Ago iso={v.updated_at} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
        {!paper.pdf_path && <p className="muted mt">No PDF is attached yet. <button className="link" onClick={goEdit}>Add it in Edit details</button> if you have it.</p>}
      </div>
    </div>
  );
}

// ---------------- Edit details ----------------

function EditTab({ paper, me, members, s, onAttached }: { paper: Paper; me: Member; members: Member[]; s: Standing; onAttached: () => void }) {
  const [v, setV] = useState({
    title: paper.title || "", authors: paper.authors || "", year: paper.year, journal: paper.journal || "",
    doi: paper.doi || "", abstract: paper.abstract || "", source: paper.source || "",
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [piNote, setPiNote] = useState(paper.pi_note || "");
  const [piMsg, setPiMsg] = useState("");
  const router = useRouter();
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "someone";

  function save() {
    start(async () => {
      const r = await updatePaper(paper.id, v);
      setMsg(r.ok ? "Saved." : "Could not save: " + r.error);
      router.refresh();
    });
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      setMsg("Uploading the PDF...");
      const link = await signedUpload(file.name);
      if (!link.ok) { setMsg("Upload failed. " + link.error); return; }
      const res = await fetch(link.url, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
      if (!res.ok) { setMsg("Upload failed: the file was not accepted by storage (" + res.status + "). Try again or tell the team."); return; }
      setMsg("Reading the text...");
      const r = await finalizeUpload(link.path, file.name, paper.id);
      if (!r.ok) { setMsg("Upload failed. " + r.error); return; }
      setMsg(r.textRead
        ? "PDF attached. It now shows on the left."
        : "PDF attached and showing on the left, but no text could be read from it (it is probably a scanned image). Use the PDF view, and screenshots for the AI drafts.");
      onAttached();
      router.refresh();
    } catch (e: any) {
      setMsg("Upload failed. Check your internet connection and try again; if it keeps failing, tell the team. (" + (e?.message || "unknown error") + ")");
    } finally {
      setUploading(false);
    }
  }
  function reextract() {
    start(async () => {
      const r = await reExtractText(paper.id);
      setMsg(!r.ok ? "Could not read the text: " + r.error : r.textRead ? "Text read again." : "No text could be read from this PDF (probably a scanned image).");
      router.refresh();
    });
  }
  function decide(d: "include" | "exclude" | null) {
    start(async () => {
      const r = await setPiDecision(paper.id, d, piNote);
      setPiMsg(r.ok ? (d ? "Saved. The paper is now " + (d === "include" ? "approved" : "rejected") + "." : "Cleared. The votes decide again.") : "Could not save: " + r.error);
      router.refresh();
    });
  }
  function remove() {
    if (!confirm(`Delete "${paper.title || "this paper"}" and everything recorded for it (votes, coding, effect rows)? This cannot be undone.`)) return;
    start(async () => {
      const r = await deletePaper(paper.id);
      if (!r.ok) { setMsg("Could not delete: " + r.error); return; }
      router.push("/");
    });
  }

  return (
    <div className="stack">
      <div>
        <h3 style={{ marginTop: 0 }}>PDF</h3>
        {paper.pdf_path ? (
          <p>A PDF is attached and shows on the left. To replace it, drop a new file below.</p>
        ) : (
          <div className="note warn" style={{ marginTop: 0 }}>
            No PDF yet. Find the paper on Google Scholar (click <b>All versions</b> for free copies), through the university library, or ask a teammate. Save it to your computer, then drop it below.
          </div>
        )}
        <DropZone
          size={paper.pdf_path ? "small" : "normal"}
          accept="application/pdf"
          disabled={uploading || pending}
          title={uploading ? "Adding the PDF..." : paper.pdf_path ? "Drop a new PDF to replace it" : "Drop the PDF here"}
          hint="or click to choose the file from your computer"
          onFiles={(fs) => upload(fs[0])}
        />
        {paper.pdf_path && <div className="mt"><button onClick={reextract} disabled={pending || uploading}>Read the text again</button></div>}
        {msg && <p className="mt"><b>{msg}</b></p>}
      </div>

      <fieldset>
        <legend>Paper details</legend>
        <p className="where">Fix these if they were filled in wrong. They do not affect the votes.</p>
        <div><label className="block">Title</label><input value={v.title} onChange={(e) => set("title", e.target.value)} style={{ width: "100%" }} /></div>
        <div><label className="block">Authors</label><input value={v.authors} onChange={(e) => set("authors", e.target.value)} style={{ width: "100%" }} /></div>
        <div className="row mt">
          <div><label>Year</label><input type="number" value={v.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} /></div>
          <div><label>Journal</label><input value={v.journal} onChange={(e) => set("journal", e.target.value)} style={{ width: 260 }} /></div>
          <div><label>DOI</label><input value={v.doi} onChange={(e) => set("doi", e.target.value)} style={{ width: 220 }} /></div>
          <div><label>Source<Help text="Where the record came from, for example a seed list or a database search." /></label><input value={v.source} onChange={(e) => set("source", e.target.value)} style={{ width: 220 }} /></div>
        </div>
        <div><label className="block">Abstract</label><textarea value={v.abstract} onChange={(e) => set("abstract", e.target.value)} style={{ minHeight: 140 }} /></div>
        <div className="mt"><button className="primary" onClick={save} disabled={pending}>Save details</button></div>
      </fieldset>

      <fieldset>
        <legend>Final decision <Help text={"For papers the votes did not settle. After the team has talked it through, anyone records the decision here; it overrides the votes either way, and the note and your name are kept with the paper. " + RULE} /></legend>
        {paper.pi_decision ? (
          <p>Recorded decision: <b>{paper.pi_decision === "include" ? "approved" : "rejected"}</b> by {nameOf(paper.pi_by)} <Ago iso={paper.pi_at} />{paper.pi_note ? ` - ${paper.pi_note}` : ""}.</p>
        ) : (
          <p className="where">No decision recorded. The votes decide ({explain(s)}).</p>
        )}
        <label className="block">Note (what the team agreed, and why)</label>
        <textarea value={piNote} onChange={(e) => setPiNote(e.target.value)} style={{ minHeight: 60 }} placeholder="For example: discussed on Nov 3; the control group is a wait-list, which counts" />
        <div className="row mt">
          <button className="primary" onClick={() => decide("include")} disabled={pending}>Record: approved</button>
          <button onClick={() => decide("exclude")} disabled={pending}>Record: rejected</button>
          {paper.pi_decision && <button onClick={() => decide(null)} disabled={pending}>Clear the decision</button>}
        </div>
        {piMsg && <p className="mt"><b>{piMsg}</b></p>}
      </fieldset>

      <fieldset>
        <legend>Remove this paper</legend>
        <p className="where">For test uploads and duplicates. Removes the paper, its PDF, and every vote, coding, and effect row on it. Papers can also be removed from the All papers list.</p>
        <button className="danger" onClick={remove} disabled={pending}>Delete this paper</button>
      </fieldset>
    </div>
  );
}
