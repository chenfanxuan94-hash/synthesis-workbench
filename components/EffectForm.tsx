"use client";

import { useMemo, useState, useTransition } from "react";
import Help from "./Help";
import { saveEffect } from "@/lib/actions";
import { computeEffect } from "@/lib/effects";
import { numbersIn } from "@/lib/parsers";
import { OUTCOME_FAMILIES, GROUP_DIMENSIONS, TIERS } from "@/lib/config";
import type { Effect } from "@/lib/types";

export type Selection = { text: string; page: number | null };

type Props = {
  paperId: string;
  effect: Effect | null;                 // editing an existing row
  initial?: Record<string, any> | null;  // a prefilled new row (from an AI draft)
  aiDraft?: boolean;
  selection: Selection | null;
  clearSelection: () => void;
  onDone: () => void;
  onCancel: () => void;
};

const NUM_KEYS = [
  "m_t_n", "m_t_mean", "m_t_sd", "m_t_events", "m_c_n", "m_c_mean", "m_c_sd", "m_c_events",
  "c_t_n", "c_t_mean", "c_t_sd", "c_t_events", "c_c_n", "c_c_mean", "c_c_sd", "c_c_events",
  "sg_d_m", "sg_se_m", "sg_d_c", "sg_se_c", "int_coef", "int_se", "page",
] as const;

const LABELS: Record<string, string> = {
  m_t_n: "Marginalized group, program group: n", m_t_mean: "Marginalized group, program group: mean", m_t_sd: "Marginalized group, program group: SD", m_t_events: "Marginalized group, program group: events",
  m_c_n: "Marginalized group, control group: n", m_c_mean: "Marginalized group, control group: mean", m_c_sd: "Marginalized group, control group: SD", m_c_events: "Marginalized group, control group: events",
  c_t_n: "Comparison group, program group: n", c_t_mean: "Comparison group, program group: mean", c_t_sd: "Comparison group, program group: SD", c_t_events: "Comparison group, program group: events",
  c_c_n: "Comparison group, control group: n", c_c_mean: "Comparison group, control group: mean", c_c_sd: "Comparison group, control group: SD", c_c_events: "Comparison group, control group: events",
  sg_d_m: "Marginalized group: effect size", sg_se_m: "Marginalized group: SE", sg_d_c: "Comparison group: effect size", sg_se_c: "Comparison group: SE",
  int_coef: "Interaction coefficient", int_se: "Interaction SE", page: "Page",
};

function blank(): Record<string, any> {
  const v: Record<string, any> = {
    outcome_family: "engagement", outcome_name: "", outcome_type: "continuous", higher_is_worse: false, timepoint: "post-test",
    group_dimension: "black_white", marginalized_group: "Black", comparison_group: "White", tier: "cells",
    int_scale: "raw", source_label: "", quote: "", notes: "",
  };
  for (const k of NUM_KEYS) v[k] = "";
  return v;
}

function fromRecord(src: Record<string, any>): Record<string, any> {
  const b = blank();
  for (const k of Object.keys(b)) {
    const val = src[k];
    if (val === undefined || val === null) continue;
    b[k] = typeof b[k] === "boolean" ? Boolean(val) : String(val);
  }
  b.higher_is_worse = Boolean(src.higher_is_worse);
  return b;
}

export default function EffectForm({ paperId, effect, initial, aiDraft, selection, clearSelection, onDone, onCancel }: Props) {
  const [v, setV] = useState<Record<string, any>>(() => (effect ? fromRecord(effect) : initial ? fromRecord(initial) : blank()));
  const [active, setActive] = useState<string>("m_t_n");
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const set = (k: string, val: any) => setV((x) => ({ ...x, [k]: val }));

  const computed = useMemo(() => computeEffect({ ...(v as any), higher_is_worse: Boolean(v.higher_is_worse) }), [v]);
  const numbers = useMemo(() => (selection ? numbersIn(selection.text) : []), [selection]);

  function useQuote() {
    if (!selection) return;
    set("quote", selection.text);
    if (selection.page && !v.page) set("page", String(selection.page));
  }
  function fill(n: string) {
    set(active, n);
    const order = currentOrder();
    const i = order.indexOf(active);
    if (i >= 0 && i < order.length - 1) setActive(order[i + 1]);
  }
  function currentOrder(): string[] {
    if (v.tier === "subgroup") return ["sg_d_m", "sg_se_m", "sg_d_c", "sg_se_c"];
    if (v.tier === "interaction") return ["int_coef", "int_se"];
    return v.outcome_type === "binary"
      ? ["m_t_events", "m_t_n", "m_c_events", "m_c_n", "c_t_events", "c_t_n", "c_c_events", "c_c_n"]
      : ["m_t_n", "m_t_mean", "m_t_sd", "m_c_n", "m_c_mean", "m_c_sd", "c_t_n", "c_t_mean", "c_t_sd", "c_c_n", "c_c_mean", "c_c_sd"];
  }
  function onGroupDim(d: string) {
    set("group_dimension", d);
    if (d === "black_white") { set("marginalized_group", "Black"); set("comparison_group", "White"); }
    if (d === "latinx_white") { set("marginalized_group", "Latinx"); set("comparison_group", "White"); }
    if (d === "income") { set("marginalized_group", "Lower-income"); set("comparison_group", "Higher-income"); }
    if (d === "other") { set("marginalized_group", ""); set("comparison_group", ""); }
  }
  function save() {
    setErr("");
    start(async () => {
      const r = await saveEffect(paperId, effect ? effect.id : null, v, Boolean(aiDraft));
      if (!r.ok) { setErr("Could not save: " + r.error); return; }
      onDone();
    });
  }

  const N = ({ k }: { k: string }) => (
    <input
      type="number" step="any" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)}
      onFocus={() => setActive(k)} title={LABELS[k]}
      style={active === k ? { outline: "3px solid var(--maroon)", outlineOffset: 1, background: "#fffbea" } : undefined}
    />
  );

  const fmt = (x: number | null) => (x === null ? "-" : x.toFixed(3));
  const seOf = (x: number | null) => (x === null ? "-" : Math.sqrt(x).toFixed(3));

  const mName = v.marginalized_group || "marginalized group";
  const cName = v.comparison_group || "comparison group";

  return (
    <fieldset className={aiDraft ? "aiform" : undefined}>
      <legend>{effect ? "Edit this row" : aiDraft ? "Check this draft, then save it" : "New row"}</legend>

      {aiDraft && (
        <div className="note warn" style={{ marginTop: 0 }}>
          <b>Drafted by AI.</b> Compare every number below with the paper on the left before you save. Fix anything that is wrong; nothing is saved until you click <b>Save effect</b>.
        </div>
      )}

      {selection && (
        <div className="selbar">
          <div>
            <b>Text you selected{selection.page ? ` (page ${selection.page})` : ""}</b>
            <Help text="Click a number below and it goes into the field with the maroon outline; the outline then moves to the next field. Click any field first to choose where the next number goes. Use as quote saves the whole sentence in section D." />
            <button className="small" style={{ marginLeft: 10 }} onClick={useQuote}>Use as quote</button>
            <button className="small" style={{ marginLeft: 6 }} onClick={clearSelection}>Dismiss</button>
          </div>
          <div className="q">{selection.text.length > 400 ? selection.text.slice(0, 400) + " ..." : selection.text}</div>
          {numbers.length > 0 ? (
            <div>
              Click a number to put it in <b>{LABELS[active] || active}</b>: {numbers.map((n) => <span key={n} className="chip" onClick={() => fill(n)}>{n}</span>)}
            </div>
          ) : <div>No numbers in this selection.</div>}
        </div>
      )}

      <h3 style={{ marginTop: 4 }}>A. What was measured</h3>
      <div className="row">
        <div>
          <label>Outcome family<Help text="Service engagement: did students start, attend, stay in, or finish services (for example sessions attended). Mental health or behavior: symptom or behavior scores (depression, anxiety, behavior ratings). Discipline or school behavior: suspensions, office referrals, absences." /></label>
          <select value={v.outcome_family} onChange={(e) => set("outcome_family", e.target.value)}>
            {Object.entries(OUTCOME_FAMILIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label>Outcome measure<Help text="The name of what was measured, as the paper calls it, for example sessions attended, or CDI depression score." /></label>
          <input value={v.outcome_name} onChange={(e) => set("outcome_name", e.target.value)} placeholder="for example: sessions attended" style={{ width: 240 }} />
        </div>
        <div>
          <label>Kind of number<Help text="Means and SDs: the paper gives an average and an SD for each group. Counts: the paper gives how many students had something happen (for example were suspended) out of how many." /></label>
          <select value={v.outcome_type} onChange={(e) => set("outcome_type", e.target.value)}>
            <option value="continuous">Means and SDs</option><option value="binary">Counts (yes or no)</option>
          </select>
        </div>
        <div>
          <label>Higher is worse?<Help text="Yes when a bigger number is a worse result: symptoms, suspensions, dropout, absences. No when a bigger number is better: sessions attended, well-being, grades. Getting this right matters: it decides the direction of every result." /></label>
          <select value={v.higher_is_worse ? "true" : "false"} onChange={(e) => set("higher_is_worse", e.target.value === "true")}>
            <option value="false">No, higher is better</option><option value="true">Yes, higher is worse</option>
          </select>
        </div>
        <div>
          <label>Time point<Help text="post-test means right after the program ended. For later measurements write follow-up and the months, for example follow-up 6 mo. Make one row per time point." /></label>
          <input value={v.timepoint} onChange={(e) => set("timepoint", e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      <h3>B. Which groups are compared</h3>
      <div className="row">
        <div>
          <label>Groups<Help text="Choose which gap this row is about. Black vs. White and Latinx vs. White are race and ethnicity gaps; lower vs. higher income is the income gap. For anything else choose Other and type the two group names." /></label>
          <select value={v.group_dimension} onChange={(e) => onGroupDim(e.target.value)}>
            {Object.entries(GROUP_DIMENSIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div><label>Marginalized group (m)<Help text="The group facing the barrier, for example Black students. Use the paper's own word if it differs." /></label><input value={v.marginalized_group} onChange={(e) => set("marginalized_group", e.target.value)} style={{ width: 170 }} /></div>
        <div><label>Comparison group (c)<Help text="The group they are compared with, for example White students. This is not the control group." /></label><input value={v.comparison_group} onChange={(e) => set("comparison_group", e.target.value)} style={{ width: 170 }} /></div>
      </div>

      <h3>C. The numbers</h3>
      <div className="row">
        <div>
          <label>What the paper gives you<Help text="Most papers give numbers for each group in each condition (a mean and SD, or a count, per box). Some give a ready-made effect size for each group. A few give only a statistical interaction. Choose the first one that fits." /></label>
          <select value={v.tier} onChange={(e) => set("tier", e.target.value)}>
            {Object.entries(TIERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      {v.tier === "cells" && (
        <div className="mt">
          <p style={{ margin: "0 0 6px" }}>
            Fill all {v.outcome_type === "binary" ? "eight" : "twelve"} boxes, copying exactly what the paper prints.
            <Help text="Rows are the two groups of students. Columns are students who got the program and students in the control group who did not. Copy each number as printed; do not round or calculate." />
          </p>
          <table className="cells">
            <thead>
              <tr>
                <th></th>
                <th colSpan={v.outcome_type === "binary" ? 2 : 3}>Got the program (treatment)</th>
                <th colSpan={v.outcome_type === "binary" ? 2 : 3}>Did not (control)</th>
              </tr>
              <tr>
                <th></th>
                {v.outcome_type === "binary"
                  ? <><th>how many had it</th><th>out of n</th><th>how many had it</th><th>out of n</th></>
                  : <><th>n</th><th>mean</th><th>SD</th><th>n</th><th>mean</th><th>SD</th></>}
              </tr>
            </thead>
            <tbody>
              {(["m", "c"] as const).map((g) => (
                <tr key={g}>
                  <th style={{ textAlign: "left" }} title={g === "m" ? mName : cName}>{g === "m" ? mName : cName}</th>
                  {v.outcome_type === "binary"
                    ? <><td><N k={`${g}_t_events`} /></td><td><N k={`${g}_t_n`} /></td><td><N k={`${g}_c_events`} /></td><td><N k={`${g}_c_n`} /></td></>
                    : <><td><N k={`${g}_t_n`} /></td><td><N k={`${g}_t_mean`} /></td><td><N k={`${g}_t_sd`} /></td><td><N k={`${g}_c_n`} /></td><td><N k={`${g}_c_mean`} /></td><td><N k={`${g}_c_sd`} /></td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {v.tier === "subgroup" && (
        <div className="row mt">
          <div><label>{mName}: effect size<Help text="Copy the effect size (d or g) exactly as printed for this group. A positive number should mean the program group scored higher. The app handles the direction using Higher is worse." /></label><N k="sg_d_m" /></div>
          <div><label>its SE<Help text="The standard error printed next to the effect size. If the paper gives a 95 percent confidence interval instead, write it in Notes so the team can convert it." /></label><N k="sg_se_m" /></div>
          <div><label>{cName}: effect size</label><N k="sg_d_c" /></div>
          <div><label>its SE</label><N k="sg_se_c" /></div>
        </div>
      )}

      {v.tier === "interaction" && (
        <div className="row mt">
          <div><label>Interaction coefficient<Help text="The number for the treatment by group term (for example Treatment x Black), exactly as printed. If you are not sure which number this is, write a note and leave it blank." /></label><N k="int_coef" /></div>
          <div><label>its SE</label><N k="int_se" /></div>
          <div>
            <label>Scale<Help text="Standardized if the paper says the outcome was standardized (in SD units). Otherwise raw. If unsure, choose raw and add a note." /></label>
            <select value={v.int_scale} onChange={(e) => set("int_scale", e.target.value)}>
              <option value="raw">raw</option><option value="standardized">standardized</option>
            </select>
          </div>
        </div>
      )}

      <div className={"mt computed" + (computed.delta === null ? " empty" : "")}>
        <b>Result</b>
        <Help text="Calculated by the app as you type. The gap change (delta) is the program's effect for the marginalized group minus its effect for the comparison group. Positive means the gap got smaller." />
        <div className="mt">
          {computed.delta === null ? (
            <span>{computed.compute_note || "Fill in the numbers above and the result appears here."}</span>
          ) : (
            <>
              <div style={{ fontSize: 16 }}>
                <b>Gap change = {fmt(computed.delta)}</b>{" "}
                {computed.delta > 0
                  ? `(positive: ${mName} gained more than ${cName}, so the gap got smaller)`
                  : computed.delta < 0
                    ? `(negative: ${cName} gained more than ${mName}, so the gap got bigger)`
                    : "(zero: both groups gained the same)"}
              </div>
              <div className="mono mt">
                {computed.g_m !== null && <div>g_m = {fmt(computed.g_m)} (SE {seOf(computed.var_m)}) &nbsp; g_c = {fmt(computed.g_c)} (SE {seOf(computed.var_c)}) &nbsp; delta SE {seOf(computed.var_delta)}</div>}
                {computed.rd_delta !== null && <div>risk-difference gap change = {fmt(computed.rd_delta)} (SE {seOf(computed.var_rd_delta)}) &nbsp; log-RR gap change = {fmt(computed.lnrr_delta)} (SE {seOf(computed.var_lnrr_delta)})</div>}
                {computed.compute_note && <div>{computed.compute_note}</div>}
              </div>
            </>
          )}
        </div>
      </div>

      <h3>D. Where you found it</h3>
      <div className="row">
        <div><label>Page<Help text="The page number of the PDF where the numbers are." /></label><N k="page" /></div>
        <div><label>Table or figure<Help text="For example Table 3. Leave blank if the numbers were in a sentence." /></label><input value={v.source_label} onChange={(e) => set("source_label", e.target.value)} placeholder="for example: Table 3" style={{ width: 170 }} /></div>
      </div>
      <div className="mt">
        <label className="block">Copied text<Help text="Paste the exact sentence or table row the numbers came from, so anyone can find them again quickly." /></label>
        <textarea value={v.quote} onChange={(e) => set("quote", e.target.value)} />
      </div>
      <div className="mt">
        <label className="block">Notes (optional)</label>
        <textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} style={{ minHeight: 50 }} placeholder="Anything others should know, for example: the paper also gives adjusted means in Table 4" />
      </div>
      {err && <div className="err">{err}</div>}
      <div className="row mt" style={{ alignItems: "center" }}>
        <button className="primary big" onClick={save} disabled={pending}>{pending ? "Saving..." : effect ? "Save changes" : "Save effect"}</button>
        <button onClick={onCancel} disabled={pending}>Cancel</button>
      </div>
    </fieldset>
  );
}
