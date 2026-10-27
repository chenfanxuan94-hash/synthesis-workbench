"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Help from "./Help";
import Instructions from "./Instructions";
import { saveCoding, setDone } from "@/lib/actions";
import {
  STUDY_DESIGNS, TARGETING_LEVELS, CULTURAL_ADAPTATION, ADAPTATION_DEPTH,
  DELIVERY_AGENTS, RISK_OF_BIAS, SETTINGS, REPORTING_LEVELS, MEASURE_VALIDATION,
} from "@/lib/config";
import { STATUS_LABEL } from "@/lib/status";
import { ago } from "@/lib/format";
import type { Task } from "@/lib/steps";
import type { Coding, Effect, Member, Paper, Standing } from "@/lib/types";

type Field = { key: keyof Coding; label: string; help: string; type: "select" | "number" | "bool"; options?: string[] };

export const FIELDS: Record<string, Field> = {
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
  { title: "D. How the results are reported (most important)", where: "Where to look: the whole Results section, every results table, and any online supplement. This answer says whether there are numbers to copy in the Effect sizes tab.", keys: ["reporting_level", "measures_validated_by_group"] },
];

export const EXTRACTABLE = REPORTING_LEVELS.slice(2);

// The "mark this paper done" box, shared by the Code and Effect sizes tabs.
export function DoneBox({ paper, coding, effects, task, members }: { paper: Paper; coding: Coding | null; effects: Effect[]; task: Task | null; members: Member[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const router = useRouter();
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "someone";
  function flip(done: boolean) {
    setErr("");
    start(async () => {
      const r = await setDone(paper.id, done);
      if (!r.ok) { setErr(r.error); return; }
      router.refresh();
    });
  }
  if (coding?.done) {
    return (
      <div className="note good">
        <b>This paper is marked done</b> by {nameOf(coding.updated_by || coding.coder_id)} {ago(coding.updated_at)}. Anyone can still edit it; if you change something, you can leave it done or reopen it.
        <div className="row mt" style={{ alignItems: "center" }}>
          {task === "code" && <Link className="btn primary big" href={`/work/code?after=${paper.id}`}>Next paper &rarr;</Link>}
          <button onClick={() => flip(false)} disabled={pending}>Reopen</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
    );
  }
  const level = coding?.reporting_level || null;
  const noNumbers = level !== null && !EXTRACTABLE.includes(level);
  const ready = Boolean(coding) && (effects.length > 0 || noNumbers);
  return (
    <div className={"note " + (ready ? "good" : "info")}>
      <b>Done with this paper?</b>{" "}
      {!coding ? "Save the study features first." : effects.length === 0 && !noNumbers ? "Add the effect rows (or set the reporting level to None or Composition only if the paper has no results by group), then mark it done." : "When the features and every effect row are in, mark it done so it leaves the to-do list."}
      <div className="row mt" style={{ alignItems: "center" }}>
        <button className={"big" + (ready ? " primary" : "")} onClick={() => flip(true)} disabled={pending || !coding}>{pending ? "Saving..." : "Mark this paper done"}</button>
        {task === "code" && <Link href={`/work/code?after=${paper.id}`}>Skip to the next paper</Link>}
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  );
}

export default function CodeTab({ paper, me, members, coding, effects, s, task, goEffects }: {
  paper: Paper; me: Member; members: Member[]; coding: Coding | null; effects: Effect[]; s: Standing; task: Task | null; goEffects: () => void;
}) {
  const init: Record<string, any> = {};
  for (const k of Object.keys(FIELDS)) init[k] = coding ? (coding as any)[k] ?? "" : "";
  init.notes = coding?.notes || "";
  const [v, setV] = useState<Record<string, any>>(init);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "someone";

  function save() {
    setErr(""); setMsg("");
    start(async () => {
      const r = await saveCoding(paper.id, v);
      if (!r.ok) { setErr(r.error); return; }
      setMsg("Saved.");
      router.refresh();
    });
  }

  return (
    <div className="stack">
      <Instructions id="code" title="What to do: record the study features">
        <ol>
          <li>Keep the paper open in the <b>PDF</b> view on the left. Each section below says where in a paper the answers usually are.</li>
          <li>Fill in what the paper says. If the paper does not say, leave the field blank; do not guess. Hover over any <b>?</b> for a definition.</li>
          <li>Section D says whether the paper has numbers by group. If it does, copy them in the <b>Effect sizes</b> tab (Claude can draft them from a screenshot).</li>
          <li>Click <b>Save</b>. This form is shared: whoever saves last is recorded, and anyone can correct it.</li>
          <li>When the features and the numbers are both in, click <b>Mark this paper done</b>.</li>
        </ol>
      </Instructions>

      {s.status !== "approved" && (
        <div className="note warn">This paper is not approved yet ({STATUS_LABEL[s.status]}). You can still code it; only approved papers go into the dataset.</div>
      )}
      {coding && (
        <p className="muted" style={{ margin: 0 }}>Last saved by <b>{nameOf(coding.updated_by || coding.coder_id)}</b> {ago(coding.updated_at)}.</p>
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
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ alignItems: "center" }}>
        <button className="primary big" onClick={save} disabled={pending}>{pending ? "Saving..." : coding ? "Save changes" : "Save"}</button>
        {msg && <span><b>{msg}</b></span>}
        <button className="link" onClick={goEffects}>Go to Effect sizes &rarr;</button>
      </div>

      <DoneBox paper={paper} coding={coding} effects={effects} task={task} members={members} />
    </div>
  );
}
