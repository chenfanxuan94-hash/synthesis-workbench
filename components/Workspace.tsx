"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
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
  OUTCOME_FAMILIES, GROUP_DIMENSIONS, SCREENERS_REQUIRED,
} from "@/lib/config";
import { TASK_STEP, taskTab, type Task } from "@/lib/steps";
import type { Coding, Decision, Effect, Member, Paper, Screening, Stage, PaperStatus } from "@/lib/types";

type Props = {
  paper: Paper;
  me: Member;
  members: Member[];
  screenings: Screening[];
  codings: Coding[];
  effects: Effect[];
  task: Task | null;
};

type PanelTab = "screen" | "code" | "effects" | "info";

const EXTRACTABLE = REPORTING_LEVELS.slice(2);

export default function Workspace({ paper, me, members, screenings, codings, effects, task }: Props) {
  const status = paperStatus(paper, screenings);
  const [viewer, setViewer] = useState<"pdf" | "text">(paper.pdf_path ? "pdf" : "text");
  const [tab, setTab] = useState<PanelTab>(() => {
    if (task) return taskTab(task);
    if (status === "included") return codings.some((c) => c.coder_id === me.id) ? "effects" : "code";
    return "screen";
  });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [find, setFind] = useState("");
  const textRef = useRef<HTMLDivElement>(null);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "?";

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
        {status === "abstract_pending"
          ? "That is fine for step 2: the title and abstract above are all you need."
          : "Full-text screening, coding, and extraction need the PDF."}{" "}
        To add it, find the paper (Google Scholar, the university library, or ask Fan), then upload it in the Info tab.
        <div className="mt"><button className="primary small" onClick={() => setTab("info")}>Open the Info tab</button></div>
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
          : <div className="note warn">This record has no abstract. Decide from the title, or look the paper up online and paste its abstract in the Info tab. When in doubt, include.</div>}
      </div>
      {noPdf}
    </>
  );

  return (
    <div className="split">
      <div className="pane left">
        <div className="head" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="tabs">
            <button className={viewer === "pdf" ? "on" : ""} onClick={() => setViewer("pdf")}>PDF</button>
            <button className={viewer === "text" ? "on" : ""} onClick={() => setViewer("text")}>Text</button>
          </div>
          <Help text="PDF shows the paper as it was published. Text shows the same words as plain text, page by page. While the Effects tab is open, select a sentence in the Text view and its numbers appear as buttons you can click into the form." />
          {viewer === "text" && pages.length > 0 && (
            <input type="search" placeholder="Find a word in the paper" value={find} onChange={(e) => setFind(e.target.value)} style={{ marginLeft: "auto", width: 240 }} />
          )}
        </div>
        <div className={"body" + (viewer === "pdf" && paper.pdf_path ? " noPad" : "")} style={viewer === "pdf" && !paper.pdf_path ? { padding: 0 } : undefined}>
          {viewer === "pdf" ? (
            paper.pdf_path ? <iframe className="pdf" src={`/api/pdf/${paper.id}`} title="PDF" /> : leftEmpty
          ) : abstractLeft ? (
            leftEmpty
          ) : (
            <div className="pages" ref={textRef} onMouseUp={onMouseUp}>
              {pages.length === 0 && (
                <div className="note warn">
                  No text could be read from this PDF. It is probably a scanned image. Read it in the PDF view and type the numbers into the form.
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
          {step && (
            <div className="row mb" style={{ alignItems: "center", gap: 10 }}>
              <span className="pill you">Step {step.n}: {step.title}</span>
              <Link href={`/work/${task}?after=${paper.id}`}>Skip this paper</Link>
              <Link href="/">Back to dashboard</Link>
            </div>
          )}
          <div className="title">{paper.title || "(untitled)"}</div>
          <div>
            {paper.first_author ? `${paper.first_author} ` : ""}{paper.year ?? ""}{paper.journal ? ` - ${paper.journal}` : ""}{" "}
            <span className={"pill " + status}>{STATUS_LABEL[status]}</span>
          </div>
          <div className="tabs mt">
            {(["screen", "code", "effects", "info"] as PanelTab[]).map((t) => (
              <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
                {t === "screen" ? "Screen" : t === "code" ? "Code" : t === "effects" ? `Effects (${effects.length})` : "Info and PDF upload"}
              </button>
            ))}
          </div>
        </div>
        <div className="body">
          {tab === "screen" && <ScreenTab paper={paper} me={me} members={members} screenings={screenings} status={status} task={task} goInfo={() => setTab("info")} abstractLeft={abstractLeft} />}
          {tab === "code" && <CodeTab paper={paper} me={me} members={members} codings={codings} status={status} task={task} />}
          {tab === "effects" && (
            <EffectsTab paper={paper} me={me} effects={effects} codings={codings} status={status} task={task}
              selection={selection} clearSelection={() => setSelection(null)} nameOf={nameOf} showText={() => setViewer("text")} />
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
    parts.push(<mark key={k++}>{text.slice(idx, idx + q.length)}</mark>);
    i = idx + q.length;
    idx = lower.indexOf(q, i);
  }
  parts.push(text.slice(i));
  return parts;
}

// Collapsible instruction box. Remembers per step whether the reader hid it.
function Instructions({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("wb_hide_" + id) === "1") setOpen(false); } catch { /* storage unavailable */ }
  }, [id]);
  return (
    <details
      className="guide-card"
      open={open}
      onToggle={(e) => {
        const o = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(o);
        try { localStorage.setItem("wb_hide_" + id, o ? "0" : "1"); } catch { /* storage unavailable */ }
      }}
    >
      <summary><span className="stepnum small">{n}</span>{title}</summary>
      {children}
    </details>
  );
}

// ---------------- Screen ----------------

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

function Checklist({ stage, onSuggest }: { stage: Stage; onSuggest: (d: Decision, reason: string) => void }) {
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
      if (stage === "abstract") {
        onSuggest("include", "");
        setMsg("Suggested: Include. Some answers are Not sure, and at this step, when in doubt, include.");
      } else {
        onSuggest("unsure", "");
        setMsg("Suggested: Unsure. Write in Notes what you could not tell; the team will discuss it.");
      }
    } else {
      setMsg("");
    }
  }

  return (
    <div>
      <b>Checklist</b>
      <Help text="Answer each question from what you can read. The checklist only suggests a decision; it is not saved. You make the final choice with the buttons below it." />
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

function ScreenTab({ paper, me, members, screenings, status, task, goInfo, abstractLeft }: {
  paper: Paper; me: Member; members: Member[]; screenings: Screening[]; status: PaperStatus; task: Task | null; goInfo: () => void; abstractLeft: boolean;
}) {
  const stage = currentStage(status);
  const resolved = status === "included" || status === "excluded";
  let stages: Stage[];
  if (task === "abstract" || task === "fulltext") stages = [task];
  else if (resolved) {
    stages = ["abstract"];
    if (screenings.some((s) => s.stage === "fulltext") || paper.fulltext_override) stages.push("fulltext");
  } else stages = stage === "fulltext" ? ["abstract", "fulltext"] : ["abstract"];
  const showAbstractOpen = stage === "abstract" || task === "abstract";
  const fulltextActive = stage === "fulltext" && stages.includes("fulltext");

  return (
    <div className="stack">
      {stage === "abstract" && (
        <Instructions id="abstract" n={2} title="What to do: screen the title and abstract">
          <ol>
            <li>{abstractLeft ? "Read the title and abstract on the left." : "Read the title (above) and the abstract (below)."}</li>
            <li>Answer the seven checklist questions from what the abstract says. If it does not say, choose <b>Not sure</b>.</li>
            <li>Look at the suggested decision. Change it if you disagree, and add a note if something was unclear.</li>
            <li>Click <b>Save my decision</b>, then <b>Next paper</b>.</li>
          </ol>
          <p style={{ margin: 0 }}>When in doubt, include. The full-text step catches what an abstract leaves out.</p>
        </Instructions>
      )}
      {fulltextActive && (
        <Instructions id="fulltext" n={3} title="What to do: screen the full text">
          <ol>
            <li>Read the paper in the <b>PDF</b> view on the left. Most answers are in the Method section.</li>
            <li>Answer the seven checklist questions strictly. One No means the paper is excluded for that reason.</li>
            <li>Do not exclude a paper only because it has no results by race or income. Those papers stay in.</li>
            <li>Click <b>Save my decision</b>, then <b>Next paper</b>.</li>
          </ol>
        </Instructions>
      )}
      {fulltextActive && !paper.pdf_path && (
        <div className="note warn">
          <b>This paper has no PDF yet.</b> Find it (Google Scholar, the library, or ask Fan) and upload it before deciding.
          <div className="mt"><button className="small primary" onClick={goInfo}>Upload the PDF in the Info tab</button></div>
        </div>
      )}

      {abstractLeft ? null : paper.abstract ? (
        showAbstractOpen ? (
          <div className="card"><h3 style={{ marginTop: 0 }}>Abstract</h3><p style={{ margin: 0 }}>{paper.abstract}</p></div>
        ) : (
          <details className="card"><summary><b>Abstract</b> (click to show)</summary><p className="mt" style={{ marginBottom: 0 }}>{paper.abstract}</p></details>
        )
      ) : (
        showAbstractOpen && (
          <div className="note warn">
            This record has no abstract. Decide from the title, or look the paper up online and paste its abstract in the Info tab. When in doubt, include.
          </div>
        )
      )}

      {stages.map((s) => (
        <StageBlock key={s} paper={paper} me={me} members={members} screenings={screenings.filter((x) => x.stage === s)} stage={s}
          active={s === stage} conflict={status === `${s}_conflict`} override={s === "abstract" ? paper.abstract_override : paper.fulltext_override} />
      ))}
      {resolved && !task && <p><b>{STATUS_LABEL[status]}.</b>{paper.override_reason ? ` Note from the discussion: ${paper.override_reason}` : ""}</p>}
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
  const next = `/work/${stage}?after=${paper.id}`;
  const label = (d: string) => (d === "include" ? "Include" : d === "exclude" ? "Exclude" : "Unsure");

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
      <legend>{stage === "abstract" ? "Your decision: title and abstract" : "Your decision: full text"}</legend>

      {active && !conflict && (
        <div className="stack">
          <Checklist stage={stage} onSuggest={(d, r) => { setDecision(d); setReason(r); }} />
          <div>
            <b>Decision</b>
            <div className="choices mt">
              {(["include", "exclude", "unsure"] as Decision[]).map((d) => (
                <button key={d} type="button" className={d + (decision === d ? " on" : "")} onClick={() => setDecision(d)}>{label(d)}</button>
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
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the other screener should know, for example what you could not tell" />
          </div>
          <div className="row" style={{ alignItems: "center" }}>
            <button className="primary big" onClick={save} disabled={pending || !decision || (decision === "exclude" && !reason)}>
              {pending ? "Saving..." : mine ? "Update my decision" : "Save my decision"}
            </button>
            {decision === "exclude" && !reason && <span>Choose a reason to save.</span>}
          </div>
        </div>
      )}

      {mine && (
        <div className="note good">
          Your decision is saved: <b>{label(mine.decision)}</b>{mine.reason ? ` - ${mine.reason}` : ""}.
          {active && !conflict && screenings.length < SCREENERS_REQUIRED && " The paper moves on when the second person has decided."}
          <div className="mt"><Link className="btn primary big" href={next}>Next paper &rarr;</Link></div>
        </div>
      )}

      {(mine || !active) ? (
        <div className="mt">
          <b>Other screeners</b>
          <Help text="Shown only after you save your own decision, so that each person decides independently." />
          {others.length === 0 ? <p>No one else has decided yet.</p> : (
            <table className="grid mt">
              <tbody>
                {others.map((s) => (
                  <tr key={s.id}><td>{nameOf(s.member_id)}</td><td><b>{label(s.decision)}</b>{s.reason ? ` - ${s.reason}` : ""}</td><td>{s.notes || ""}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        active && <p className="mt">The other screener&apos;s decision appears after you save yours.</p>
      )}

      {conflict && (
        <div className="note warn mt">
          <b>The screeners did not agree</b> (or someone chose Unsure). This paper is now in step 4, Disagreements. You can move on to the next paper; when you meet with the other screener, come back here and record what you agreed.
          <Help text="Discuss the paper together, then record the agreed decision with a short note. The note and your name are kept with the paper." />
          <table className="grid mt">
            <tbody>
              {screenings.map((s) => (
                <tr key={s.id}><td>{nameOf(s.member_id)}</td><td><b>{label(s.decision)}</b>{s.reason ? ` - ${s.reason}` : ""}</td><td>{s.notes || ""}</td></tr>
              ))}
            </tbody>
          </table>
          <label className="block">What did you agree, and why?</label>
          <textarea value={resolution} onChange={(e) => setResolution(e.target.value)} />
          <div className="mt">
            <button className="primary" onClick={() => resolve("include")} disabled={pending}>Agreed: include</button>{" "}
            <button onClick={() => resolve("exclude")} disabled={pending}>Agreed: exclude</button>
          </div>
        </div>
      )}
      {override && <p className="mt">Settled by discussion as <b>{override}</b>.</p>}
    </fieldset>
  );
}

// ---------------- Code ----------------

type Field = { key: keyof Coding; label: string; help: string; type: "select" | "number" | "bool"; options?: string[] };

const FIELDS: Record<string, Field> = {
  study_design: { key: "study_design", label: "Study design", type: "select", options: STUDY_DESIGNS, help: "RCT: students were assigned by chance. Cluster RCT: whole classrooms or schools were assigned by chance. Quasi-experiment: no chance assignment, but a similar control group was used." },
  setting: { key: "setting", label: "School level", type: "select", options: SETTINGS, help: "The grades of the students in the study. Mixed if it covers more than one level." },
  age_min: { key: "age_min", label: "Youngest age", type: "number", help: "In years. If the paper gives grades only, leave blank and write the grades in the notes." },
  age_max: { key: "age_max", label: "Oldest age", type: "number", help: "In years." },
  n_total: { key: "n_total", label: "Number of students", type: "number", help: "The total number of students in the analysis (both groups together)." },
  risk_of_bias: { key: "risk_of_bias", label: "Risk of bias", type: "select", options: RISK_OF_BIAS, help: "How much to trust the comparison. Low: assigned by chance, few students missing from the results, groups looked alike at the start. High: groups differed a lot at the start, or many students are missing. Some concerns: in between. Write why in the notes. If unsure, choose Not assessed." },
  targeting_level: { key: "targeting_level", label: "Who the program was for", type: "select", options: TARGETING_LEVELS, help: "Universal: every student in a class or school. Selective: a group at higher risk because of who they are or where they live. Indicated: students screened and found to already have symptoms or behavior problems." },
  cultural_adaptation: { key: "cultural_adaptation", label: "Culturally adapted?", type: "select", options: CULTURAL_ADAPTATION, help: "Yes only when the authors describe actual changes made to fit a racial, ethnic, or cultural group: language, examples, values, who delivers it, content. A general claim of being culturally sensitive, with no changes described, is No." },
  adaptation_depth: { key: "adaptation_depth", label: "Kind of adaptation", type: "select", options: ADAPTATION_DEPTH, help: "Only if adapted. Surface: language, pictures, names, examples. Deep: values, goals, methods, or the context of the group. Both if the paper describes both." },
  delivery_agent: { key: "delivery_agent", label: "Who delivered it", type: "select", options: DELIVERY_AGENTS, help: "The person who ran the program with the students. Clinician includes counselors, psychologists, and social workers." },
  dosage_sessions: { key: "dosage_sessions", label: "Number of sessions", type: "number", help: "How many sessions were planned. Leave blank if not reported." },
  dosage_weeks: { key: "dosage_weeks", label: "Length in weeks", type: "number", help: "How many weeks the program was planned to run." },
  pct_black: { key: "pct_black", label: "% Black", type: "number", help: "Percent of the sample. Type 42 for 42 percent. Count African American as Black." },
  pct_latinx: { key: "pct_latinx", label: "% Latinx", type: "number", help: "Percent of the sample. Count Hispanic as Latinx." },
  pct_low_income: { key: "pct_low_income", label: "% lower-income", type: "number", help: "Percent of the sample that is lower-income, usually reported as free or reduced-price lunch." },
  single_group_sample: { key: "single_group_sample", label: "Only one group in the study?", type: "bool", help: "Yes when (nearly) all students belong to one group, for example all Black students or all Latinx students. Then no gap can be computed within the study." },
  reporting_level: { key: "reporting_level", label: "Reporting level", type: "select", options: REPORTING_LEVELS, help: "Pick the most detailed one found anywhere in the paper or supplement. Cells: means or counts for each group in both the program and the control group (like the worked example in the guide). Group-specific effects: an effect size for each group. Interaction: a test of whether the program worked differently by group. Composition only: just the percent of students in each group. None: not even that." },
  measures_validated_by_group: { key: "measures_validated_by_group", label: "Measures checked for each group?", type: "select", options: MEASURE_VALIDATION, help: "Does the paper say the questionnaires or scales were tested and work the same way for each group being compared? Usually in the Measures part of the Method section. Most papers do not say; then choose No or not reported." },
};

const GROUPS: { title: string; where: string; keys: string[] }[] = [
  { title: "A. About the study", where: "Where to look: the Method section (Design, Participants) and Table 1.", keys: ["study_design", "setting", "age_min", "age_max", "n_total", "risk_of_bias"] },
  { title: "B. About the program", where: "Where to look: the Method section, usually a part called Intervention, Program, or Procedure.", keys: ["targeting_level", "cultural_adaptation", "adaptation_depth", "delivery_agent", "dosage_sessions", "dosage_weeks"] },
  { title: "C. Who was in the sample", where: "Where to look: Table 1 or the Participants paragraph.", keys: ["pct_black", "pct_latinx", "pct_low_income", "single_group_sample"] },
  { title: "D. How the results are reported (most important)", where: "Where to look: the whole Results section, every results table, and any online supplement. This answer decides whether the paper goes to step 6.", keys: ["reporting_level", "measures_validated_by_group"] },
];

function CodeTab({ paper, me, members, codings, status, task }: { paper: Paper; me: Member; members: Member[]; codings: Coding[]; status: PaperStatus; task: Task | null }) {
  const mine = codings.find((c) => c.coder_id === me.id);
  const init: Record<string, any> = {};
  for (const k of Object.keys(FIELDS)) init[k] = mine ? (mine as any)[k] ?? "" : "";
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

  return (
    <div className="stack">
      <Instructions id="code" n={5} title="What to do: code the study features">
        <ol>
          <li>Keep the paper open in the <b>PDF</b> view on the left. Each section below says where in a paper the answers usually are.</li>
          <li>Fill in what the paper says. If the paper does not say, leave the field blank; do not guess.</li>
          <li>Hover over any <b>?</b> for a definition with examples.</li>
          <li>Section D decides whether the paper goes to step 6. Check the Results section, every table, and any supplement before you answer.</li>
          <li>Click <b>Save my coding</b>, then <b>Next paper</b>.</li>
        </ol>
      </Instructions>
      {status !== "included" && (
        <div className="note warn">This paper has not passed screening yet ({STATUS_LABEL[status]}). Coding is normally done only for included papers.</div>
      )}

      {GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend>{g.title}</legend>
          <p className="where">{g.where}</p>
          <div className="row">
            {g.keys.map((k) => {
              const f = FIELDS[k];
              return (
                <div key={k} style={{ minWidth: f.type === "number" ? 150 : 250 }}>
                  <label>{f.label}<Help text={f.help} /></label>
                  {f.type === "select" && (
                    <select value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)}>
                      <option value="">Choose</option>
                      {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                  {f.type === "number" && <input type="number" step="any" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} />}
                  {f.type === "bool" && (
                    <select value={v[k] === true ? "true" : v[k] === false ? "false" : ""} onChange={(e) => set(k, e.target.value === "" ? "" : e.target.value === "true")}>
                      <option value="">Choose</option><option value="true">Yes</option><option value="false">No</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div>
        <label className="block">Notes (optional)</label>
        <textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Why you chose what you chose, with page numbers, for example: risk of bias some concerns, 20 percent of students missing at post-test (p. 7)" />
      </div>
      <div className="row" style={{ alignItems: "center" }}>
        <button className="primary big" onClick={save} disabled={pending}>{pending ? "Saving..." : mine ? "Update my coding" : "Save my coding"}</button>
      </div>
      {mine && (
        <div className="note good">
          Your coding is saved.
          {task === "code" && <div className="mt"><Link className="btn primary big" href={`/work/code?after=${paper.id}`}>Next paper &rarr;</Link></div>}
        </div>
      )}

      {codings.length > 1 && (
        <div>
          <h3>
            Compare the codings
            <Help text="Two people code each paper. Fields where they differ are marked. After the coders talk it through, Fan marks one coding as final; the dataset uses the final coding." />
          </h3>
          <table className="grid">
            <thead>
              <tr><th>Field</th>{codings.map((c) => <th key={c.id}>{nameOf(c.coder_id)}{c.is_final ? " (final)" : ""}</th>)}<th></th></tr>
            </thead>
            <tbody>
              {Object.values(FIELDS).map((f) => {
                const vals = codings.map((c) => String((c as any)[f.key] ?? ""));
                const differ = new Set(vals).size > 1;
                return (
                  <tr key={f.key}>
                    <td>{f.label}</td>
                    {vals.map((x, i) => <td key={i}>{x}</td>)}
                    <td>{differ ? <span className="pill abstract_conflict">differs</span> : ""}</td>
                  </tr>
                );
              })}
              <tr><td>Notes</td>{codings.map((c) => <td key={c.id}>{c.notes || ""}</td>)}<td></td></tr>
            </tbody>
          </table>
          <div className="row mt">
            {codings.map((c) => !c.is_final && (
              <button key={c.id} className="small" onClick={() => makeFinal(c.id)} disabled={pending}>Mark {nameOf(c.coder_id)}&apos;s coding as final</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Effects ----------------

function EffectsTab({ paper, me, effects, codings, status, task, selection, clearSelection, nameOf, showText }: {
  paper: Paper; me: Member; effects: Effect[]; codings: Coding[]; status: PaperStatus; task: Task | null;
  selection: Selection | null; clearSelection: () => void; nameOf: (id: string | null) => string; showText: () => void;
}) {
  const [editing, setEditing] = useState<Effect | null | "new">(null);
  const [checking, setChecking] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const verifying = task === "verify";

  useEffect(() => { if (selection && editing === null) setEditing("new"); }, [selection]); // eslint-disable-line

  const coding = codings.find((c) => c.is_final) || codings.find((c) => c.coder_id === me.id) || codings[0];
  const level = coding?.reporting_level || null;
  const toCheck = effects.filter((e) => e.entered_by !== me.id && !e.verified_by);

  function verify(e: Effect, on: boolean) {
    start(async () => { await verifyEffect(paper.id, e.id, on); setEditing(null); setChecking(false); clearSelection(); router.refresh(); });
  }
  function remove(e: Effect) {
    if (!confirm("Delete this row? This cannot be undone.")) return;
    start(async () => { await deleteEffect(paper.id, e.id); router.refresh(); });
  }
  const fmt = (v: number | null) => (v === null ? "" : v.toFixed(2));

  return (
    <div className="stack">
      {verifying ? (
        <Instructions id="verify" n={7} title="What to do: check someone else's numbers">
          <ol>
            <li>In the table below, click <b>Check</b> on a row marked <b>Not checked</b>. The form opens with the numbers that were entered.</li>
            <li>Find the page and table it lists (section D of the form) in the <b>PDF</b> view on the left.</li>
            <li>Compare every number, the outcome, the groups, and the <b>Higher is worse</b> answer.</li>
            <li>If everything matches, click <b>Everything matches - mark as checked</b>. If something is wrong, fix it, click <b>Save my corrections</b>, and tell the person who entered it.</li>
            <li>When every row is checked, click <b>Next paper</b>.</li>
          </ol>
        </Instructions>
      ) : (
        <Instructions id="extract" n={6} title="What to do: copy the numbers">
          <ol>
            <li>Find the results split by group: the Results section, the tables, or the online supplement.</li>
            <li>Click <b>Add effect</b>. Fill the form in order, sections A to D.</li>
            <li>To copy numbers quickly: <button className="link" onClick={showText}>switch the left side to Text</button>, select the sentence or table row with your mouse, then click each number in the yellow box. It goes into the outlined field and the outline moves to the next field.</li>
            <li>Check that the green box at the end shows a result, then click <b>Save effect</b>.</li>
            <li>Add one row for each outcome, each group comparison, and each time point. Then click <b>Next paper</b>.</li>
          </ol>
          <p style={{ margin: 0 }}>Not sure what goes where? <Link href="/guide#example" target="_blank">Open the worked example</Link> in a new tab.</p>
        </Instructions>
      )}

      {!verifying && status !== "included" && (
        <div className="note warn">This paper has not passed screening yet ({STATUS_LABEL[status]}). Numbers are normally copied only for included papers.</div>
      )}
      {!verifying && status === "included" && !coding && (
        <div className="note warn">Code this paper first (Code tab). Section D of the coding tells us whether there are numbers to copy.</div>
      )}
      {!verifying && coding && level && !EXTRACTABLE.includes(level) && (
        <div className="note info">
          The coding says: <b>{level}</b>. That means there are probably no numbers by group to copy from this paper.
          If you do find results by group, change the reporting level in the Code tab first.
        </div>
      )}

      {editing === null && !verifying && (
        <div><button className="primary big" onClick={() => setEditing("new")}>+ Add effect</button></div>
      )}
      {editing !== null && (
        <EffectForm
          paperId={paper.id}
          effect={editing === "new" ? null : editing}
          selection={selection}
          clearSelection={clearSelection}
          onDone={() => { setEditing(null); setChecking(false); clearSelection(); router.refresh(); }}
          onCancel={() => { setEditing(null); setChecking(false); clearSelection(); }}
          onVerify={checking && editing !== "new" ? () => verify(editing, true) : undefined}
        />
      )}

      {effects.length > 0 && (
        <>
          <h3>Rows entered for this paper</h3>
          <table className="grid">
            <thead>
              <tr><th>Outcome</th><th>Groups</th><th>Gap change<Help text="delta, with its standard error in brackets. Positive means the marginalized group gained more, so the gap got smaller. Negative means the gap got bigger." /></th><th>Where</th><th>Entered by</th><th>Checked</th><th></th></tr>
            </thead>
            <tbody>
              {effects.map((e) => (
                <tr key={e.id}>
                  <td>{OUTCOME_FAMILIES[e.outcome_family]}<br />{e.outcome_name || ""}{e.timepoint ? ` (${e.timepoint})` : ""}</td>
                  <td>{GROUP_DIMENSIONS[e.group_dimension]}{e.group_dimension === "other" ? `: ${e.marginalized_group} vs ${e.comparison_group}` : ""}</td>
                  <td className="nowrap">{e.delta === null ? <span className="pill abstract_conflict">incomplete</span> : `${fmt(e.delta)} (${fmt(e.var_delta !== null ? Math.sqrt(e.var_delta) : null)})`}</td>
                  <td>{e.page ? `p. ${e.page} ` : ""}{e.source_label || ""}</td>
                  <td>{nameOf(e.entered_by)}</td>
                  <td>{e.verified_by ? <span className="pill included">by {nameOf(e.verified_by)}</span> : <span className="pill abstract_conflict">Not checked</span>}</td>
                  <td className="nowrap">
                    {e.entered_by !== me.id && !e.verified_by && (
                      <button className="small primary" onClick={() => { setChecking(true); setEditing(e); }} disabled={pending}>Check</button>
                    )}{" "}
                    {e.entered_by !== me.id && e.verified_by && (
                      <button className="small" onClick={() => verify(e, false)} disabled={pending}>Uncheck</button>
                    )}{" "}
                    <button className="small" onClick={() => { setChecking(false); setEditing(e); }} disabled={pending}>Edit</button>{" "}
                    <button className="small" onClick={() => remove(e)} disabled={pending}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {verifying && toCheck.length === 0 && (
        <div className="note good">
          Every row on this paper that someone else entered is checked.
          <div className="mt"><Link className="btn primary big" href={`/work/verify?after=${paper.id}`}>Next paper &rarr;</Link></div>
        </div>
      )}
      {!verifying && task === "extract" && effects.length > 0 && editing === null && (
        <div className="note good">
          When every outcome, group comparison, and time point has a row, move on.
          <div className="mt"><Link className="btn primary big" href={`/work/extract?after=${paper.id}`}>Next paper &rarr;</Link></div>
        </div>
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
    setMsg("Uploading the PDF...");
    const { path, url } = await signedUpload(file.name);
    const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": "application/pdf" } });
    if (!res.ok) { setMsg("Upload failed (" + res.status + "). Try again or tell Fan."); return; }
    setMsg("Reading the text...");
    await finalizeUpload(path, file.name, paper.id);
    setMsg("PDF attached. It now shows on the left.");
    router.refresh();
  }
  function reextract() {
    start(async () => { await reExtractText(paper.id); setMsg("Text read again."); router.refresh(); });
  }
  function remove() {
    if (!confirm("Delete this paper and everything recorded for it? This cannot be undone.")) return;
    start(async () => { await deletePaper(paper.id); });
  }

  return (
    <div className="stack">
      <fieldset>
        <legend>PDF</legend>
        {paper.pdf_path ? <p>A PDF is attached. To replace it, choose a new file.</p> : (
          <div className="note warn" style={{ marginTop: 0 }}>
            No PDF yet. Find the paper on Google Scholar (click <b>All versions</b> for free copies), through the university library, or ask Fan. Save it to your computer, then choose it below.
          </div>
        )}
        <div className="row">
          <div><label>{paper.pdf_path ? "Replace PDF" : "Upload PDF"}</label><input type="file" accept="application/pdf" onChange={(e) => upload(e.target.files?.[0])} /></div>
          {paper.pdf_path && <button onClick={reextract} disabled={pending}>Read the text again</button>}
        </div>
        {msg && <p className="mt"><b>{msg}</b></p>}
      </fieldset>
      <fieldset>
        <legend>Paper details</legend>
        <p className="where">Fix these if they were filled in wrong. They do not affect screening decisions.</p>
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
      <div><button onClick={remove} disabled={pending}>Delete this paper</button></div>
    </div>
  );
}
