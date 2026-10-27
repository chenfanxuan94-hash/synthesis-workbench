"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Help from "./Help";
import Ago from "./Ago";
import Instructions from "./Instructions";
import { saveCoding, setDone, draftCoding } from "@/lib/actions";
import { CODING_FIELDS, CODING_GROUPS, CODING_KEYS, type EvidenceMap } from "@/lib/codingFields";
import { REPORTING_LEVELS } from "@/lib/config";
import { STATUS_LABEL } from "@/lib/status";
import type { Task } from "@/lib/steps";
import type { Coding, Effect, Member, Paper, Standing } from "@/lib/types";

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
        <b>This paper is marked done</b> by {nameOf(coding.updated_by || coding.coder_id)} <Ago iso={coding.updated_at} />. Anyone can still edit it; if you change something, you can leave it done or reopen it.
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

// A small quote mark next to a field; hovering it shows the sentence and page the value came from.
function Evidence({ e }: { e: { quote: string; page: number | null } }) {
  return (
    <span className="ev" tabIndex={0} aria-label={`Evidence: ${e.quote}${e.page ? ` (page ${e.page})` : ""}`}>
      &#10077;
      <span className="tip">
        <b>Where this came from{e.page ? ` (page ${e.page})` : ""}</b>
        <div className="q">&ldquo;{e.quote}&rdquo;</div>
      </span>
    </span>
  );
}

export default function CodeTab({ paper, me, members, coding, effects, s, task, aiReady, goEffects }: {
  paper: Paper; me: Member; members: Member[]; coding: Coding | null; effects: Effect[]; s: Standing; task: Task | null; aiReady: boolean; goEffects: () => void;
}) {
  const init: Record<string, any> = {};
  for (const k of CODING_KEYS) init[k] = coding ? (coding as any)[k] ?? "" : "";
  init.notes = coding?.notes || "";
  const [v, setV] = useState<Record<string, any>>(init);
  const [ev, setEv] = useState<EvidenceMap>((coding?.evidence as EvidenceMap) || {});
  const [aiTouched, setAiTouched] = useState<boolean>(Boolean(coding?.ai_assisted));
  const [overwrite, setOverwrite] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name || "someone";
  const hasText = (paper.pages || []).length > 0;
  const filled = CODING_KEYS.filter((k) => v[k] !== "" && v[k] !== null && v[k] !== undefined).length;

  function save() {
    setErr(""); setMsg("");
    start(async () => {
      const r = await saveCoding(paper.id, v, ev, aiTouched);
      if (!r.ok) { setErr(r.error); return; }
      setMsg(r.warning ? r.warning : "Saved.");
      router.refresh();
    });
  }

  async function fillWithAI() {
    setAiBusy(true); setAiMsg(""); setErr("");
    try {
      const r = await draftCoding(paper.id);
      if (!r.ok) { setErr(r.error); return; }
      let used = 0, skipped = 0, empty = 0;
      const next = { ...v };
      const nextEv: EvidenceMap = { ...ev };
      for (const k of CODING_KEYS) {
        const f = r.fields[k];
        if (!f || f.value === null) { empty++; continue; }
        const already = next[k] !== "" && next[k] !== null && next[k] !== undefined;
        if (already && !overwrite) { skipped++; continue; }
        next[k] = f.value;
        if (r.evidence[k]) nextEv[k] = r.evidence[k];
        used++;
      }
      setV(next); setEv(nextEv); setAiTouched(aiTouched || used > 0);
      setAiMsg(`The AI filled ${used} ${used === 1 ? "field" : "fields"}${skipped ? `, left ${skipped} you had already filled` : ""}${empty ? `, and found nothing for ${empty}` : ""}. ${r.pagesSkipped.length ? `It read ${r.pagesRead} of ${r.pagesTotal} pages; it skipped pages ${r.pagesSkipped.join(", ")} (mostly references), so check fields that may depend on them. ` : (r.pagesTotal === 1 ? "It read the one page of text. " : `It read all ${r.pagesTotal} pages. `)}${r.summary} Hover the quote mark next to a field to see the sentence it used. Check every field against the paper, then click Save.`);
    } catch (e: any) {
      setErr("Something went wrong: " + (e?.message || "unknown error"));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="stack">
      <Instructions id="code" title="What to do: record the study features">
        <ol>
          <li>Fill the form by hand from the paper on the left, or click <b>Fill with AI</b> and the form is filled from the paper&apos;s text with a quote behind each value. Either way, check every field against the paper.</li>
          <li>Each section says where in a paper the answers usually are. If the paper does not say, leave the field blank; do not guess. Hover over any <b>?</b> for a definition.</li>
          <li>Section D says whether the paper has numbers by group. If it does, copy them in the <b>Effect sizes</b> tab.</li>
          <li>Click <b>Save</b>. This form is shared: whoever saves last is recorded, and anyone can correct it.</li>
          <li>When the features and the numbers are both in, click <b>Mark this paper done</b>.</li>
        </ol>
      </Instructions>

      {s.status !== "approved" && (
        <div className="note warn">This paper is not approved yet ({STATUS_LABEL[s.status]}). You can still code it; only approved papers go into the dataset.</div>
      )}
      {coding && (
        <p className="muted" style={{ margin: 0 }}>
          Last saved by <b>{nameOf(coding.updated_by || coding.coder_id)}</b> <Ago iso={coding.updated_at} />.{coding.ai_assisted ? <> <span className="pill ai">AI-assisted</span></> : ""}
        </p>
      )}

      <div className="aichoice">
        <div className="row" style={{ alignItems: "center" }}>
          <button className="primary" onClick={fillWithAI} disabled={!aiReady || !hasText || aiBusy || pending} title={!aiReady ? "AI drafts are not set up yet" : !hasText ? "This paper has no readable text" : ""}>
            {aiBusy ? "Reading the paper... 20 to 60 seconds" : "Fill with AI from the paper's text"}
          </button>
          <span className="muted">or fill the form by hand below, no AI involved.</span>
          {filled > 0 && aiReady && hasText && (
            <label className="inline muted" style={{ marginLeft: "auto" }}><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} disabled={aiBusy} /> let the AI overwrite fields already filled</label>
          )}
        </div>
        {!aiReady && <p className="muted" style={{ margin: "6px 0 0" }}>AI drafts are not set up yet: add the <span className="mono">ANTHROPIC_API_KEY</span> in the Vercel project settings.</p>}
        {aiReady && !hasText && <p className="muted" style={{ margin: "6px 0 0" }}>No readable text for this paper (no PDF, or a scanned one), so the AI cannot read it.</p>}
        {aiMsg && <div className="note info" style={{ marginBottom: 0 }}>{aiMsg}</div>}
      </div>

      {CODING_GROUPS.map((g) => (
        <fieldset key={g.title}>
          <legend>{g.title}</legend>
          <p className="where">{g.where}</p>
          <div className="row">
            {g.keys.map((k) => {
              const f = CODING_FIELDS[k];
              return (
                <div key={k} style={{ minWidth: f.type === "number" ? 150 : 250 }}>
                  <label>{f.label}<Help text={f.help} />{ev[k] && <Evidence e={ev[k]} />}</label>
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
        <button className="primary big" onClick={save} disabled={pending || aiBusy}>{pending ? "Saving..." : coding ? "Save changes" : "Save"}</button>
        {msg && <span><b>{msg}</b></span>}
        <button className="link" onClick={goEffects}>Go to Effect sizes &rarr;</button>
      </div>

      <DoneBox paper={paper} coding={coding} effects={effects} task={task} members={members} />
    </div>
  );
}
