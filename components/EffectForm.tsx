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
  effect: Effect | null;
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
  m_t_n: "Marginalized group, treatment arm: n", m_t_mean: "Marginalized group, treatment arm: mean", m_t_sd: "Marginalized group, treatment arm: SD", m_t_events: "Marginalized group, treatment arm: events",
  m_c_n: "Marginalized group, control arm: n", m_c_mean: "Marginalized group, control arm: mean", m_c_sd: "Marginalized group, control arm: SD", m_c_events: "Marginalized group, control arm: events",
  c_t_n: "Comparison group, treatment arm: n", c_t_mean: "Comparison group, treatment arm: mean", c_t_sd: "Comparison group, treatment arm: SD", c_t_events: "Comparison group, treatment arm: events",
  c_c_n: "Comparison group, control arm: n", c_c_mean: "Comparison group, control arm: mean", c_c_sd: "Comparison group, control arm: SD", c_c_events: "Comparison group, control arm: events",
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

export default function EffectForm({ paperId, effect, selection, clearSelection, onDone, onCancel }: Props) {
  const [v, setV] = useState<Record<string, any>>(() => {
    if (!effect) return blank();
    const b = blank();
    for (const k of Object.keys(b)) b[k] = (effect as any)[k] ?? (typeof b[k] === "boolean" ? false : "");
    b.higher_is_worse = Boolean(effect.higher_is_worse);
    return b;
  });
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
      try {
        await saveEffect(paperId, effect ? effect.id : null, v);
        onDone();
      } catch (e: any) {
        setErr(e?.message || "Save failed");
      }
    });
  }

  const N = ({ k }: { k: string }) => (
    <input
      type="number" step="any" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)}
      onFocus={() => setActive(k)} title={LABELS[k]}
      style={active === k ? { outline: "2px solid #000", outlineOffset: 1 } : undefined}
    />
  );

  const fmt = (x: number | null) => (x === null ? "-" : x.toFixed(3));
  const seOf = (x: number | null) => (x === null ? "-" : Math.sqrt(x).toFixed(3));

  return (
    <fieldset>
      <legend>{effect ? "Edit effect" : "New effect"}</legend>

      {selection && (
        <div className="selbar">
          <div>
            <b>Selected text{selection.page ? ` (page ${selection.page})` : ""}</b>
            <Help text="Text you highlighted in the Text pane. Use as quote stores it as the verbatim source for this row. Click a number to drop it into the highlighted field; the highlight then moves to the next field in reading order. Click any field to make it the target." />
            <button className="small" style={{ marginLeft: 10 }} onClick={useQuote}>Use as quote</button>
            <button className="small" style={{ marginLeft: 6 }} onClick={clearSelection}>Dismiss</button>
          </div>
          <div className="q">{selection.text.length > 400 ? selection.text.slice(0, 400) + " ..." : selection.text}</div>
          {numbers.length > 0 && (
            <div>
              Numbers found (fills: <b>{LABELS[active] || active}</b>): {numbers.map((n) => <span key={n} className="chip" onClick={() => fill(n)}>{n}</span>)}
            </div>
          )}
        </div>
      )}

      <div className="row">
        <div>
          <label>Outcome family<Help text="engagement is the primary family (initiation, sessions attended, retention, completion). mental_health covers symptom and functioning measures. discipline covers suspensions, referrals, attendance." /></label>
          <select value={v.outcome_family} onChange={(e) => set("outcome_family", e.target.value)}>
            {Object.entries(OUTCOME_FAMILIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label>Outcome measure</label>
          <input value={v.outcome_name} onChange={(e) => set("outcome_name", e.target.value)} placeholder="e.g. sessions attended; PHQ-A depression" style={{ width: 260 }} />
        </div>
        <div>
          <label>Type<Help text="continuous: means and SDs. binary: counts of youth with the event (suspended, initiated treatment) out of n." /></label>
          <select value={v.outcome_type} onChange={(e) => set("outcome_type", e.target.value)}>
            <option value="continuous">continuous</option><option value="binary">binary</option>
          </select>
        </div>
        <div>
          <label>Higher is worse<Help text="Yes for symptoms, suspensions, dropout, absences. No for attendance, sessions completed, functioning, well-being. This is how the app orients every effect so that positive always means improvement and a positive gap change always means the gap narrowed." /></label>
          <select value={v.higher_is_worse ? "true" : "false"} onChange={(e) => set("higher_is_worse", e.target.value === "true")}>
            <option value="false">No, higher is better</option><option value="true">Yes, higher is worse</option>
          </select>
        </div>
        <div>
          <label>Timepoint<Help text="post-test, or follow-up with months, e.g. follow-up 6 mo. One row per timepoint." /></label>
          <input value={v.timepoint} onChange={(e) => set("timepoint", e.target.value)} style={{ width: 150 }} />
        </div>
      </div>

      <div className="row mt">
        <div>
          <label>Group contrast<Help text="The gap being measured. The marginalized group is m; the comparison group is c. Positive gap change means m benefited more than c." /></label>
          <select value={v.group_dimension} onChange={(e) => onGroupDim(e.target.value)}>
            {Object.entries(GROUP_DIMENSIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div><label>Marginalized group (m)</label><input value={v.marginalized_group} onChange={(e) => set("marginalized_group", e.target.value)} style={{ width: 170 }} /></div>
        <div><label>Comparison group (c)</label><input value={v.comparison_group} onChange={(e) => set("comparison_group", e.target.value)} style={{ width: 170 }} /></div>
        <div>
          <label>What the paper reports<Help text="cells: means, SDs and Ns (or event counts and Ns) for each group in each arm; the app computes everything. subgroup: the paper gives an effect size and SE per group. interaction: the paper gives a treatment-by-group coefficient and SE. Use the most detailed form available." /></label>
          <select value={v.tier} onChange={(e) => set("tier", e.target.value)}>
            {Object.entries(TIERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      </div>

      {v.tier === "cells" && (
        <div className="mt">
          <b>Group-by-arm cells</b>
          <Help text="Rows are the two groups, columns are the two arms. For continuous outcomes enter n, mean and SD per cell. For binary outcomes enter the number of youth with the event and the n per cell. Effects for each group are standardized with one common SD, the control-arm SD pooled across both groups." />
          <table className="cells">
            <thead>
              <tr>
                <th></th>
                <th colSpan={v.outcome_type === "binary" ? 2 : 3}>Treatment arm</th>
                <th colSpan={v.outcome_type === "binary" ? 2 : 3}>Control arm</th>
              </tr>
              <tr>
                <th></th>
                {v.outcome_type === "binary" ? <><th>events</th><th>n</th><th>events</th><th>n</th></> : <><th>n</th><th>mean</th><th>SD</th><th>n</th><th>mean</th><th>SD</th></>}
              </tr>
            </thead>
            <tbody>
              {(["m", "c"] as const).map((g) => (
                <tr key={g}>
                  <th style={{ textAlign: "left" }}>{g === "m" ? v.marginalized_group || "m" : v.comparison_group || "c"}</th>
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
          <div><label>{v.marginalized_group || "m"}: effect size<Help text="As printed in the paper (d or g), positive meaning the treatment group scored higher on the outcome. The app flips the sign when higher is worse." /></label><N k="sg_d_m" /></div>
          <div><label>SE</label><N k="sg_se_m" /></div>
          <div><label>{v.comparison_group || "c"}: effect size</label><N k="sg_d_c" /></div>
          <div><label>SE</label><N k="sg_se_c" /></div>
        </div>
      )}

      {v.tier === "interaction" && (
        <div className="row mt">
          <div><label>Treatment x group coefficient<Help text="The coefficient on the treatment-by-marginalized-group term, as printed, positive meaning the treatment effect on the outcome scale was larger for the marginalized group. The app flips the sign when higher is worse." /></label><N k="int_coef" /></div>
          <div><label>SE</label><N k="int_se" /></div>
          <div>
            <label>Scale<Help text="standardized when the outcome was standardized before modeling (coefficient in SD units). raw otherwise; raw rows are kept but flagged, since they are not comparable to SMD rows without conversion." /></label>
            <select value={v.int_scale} onChange={(e) => set("int_scale", e.target.value)}>
              <option value="raw">raw</option><option value="standardized">standardized</option>
            </select>
          </div>
        </div>
      )}

      <div className="box mt">
        <b>Computed</b>
        <Help text="Updated as you type. g_m and g_c are the group-specific effects (Hedges g, positive = improvement). delta = g_m - g_c is the gap change with its SE. Binary outcomes also show the difference in risk differences and in log risk ratios." />
        <div className="mono mt">
          {computed.delta === null ? (
            <span>{computed.compute_note || "Enter the numbers above."}</span>
          ) : (
            <>
              {computed.g_m !== null && <div>g_m = {fmt(computed.g_m)} (SE {seOf(computed.var_m)}) &nbsp; g_c = {fmt(computed.g_c)} (SE {seOf(computed.var_c)})</div>}
              <div><b>delta = {fmt(computed.delta)} (SE {seOf(computed.var_delta)})</b></div>
              {computed.rd_delta !== null && <div>risk-difference gap change = {fmt(computed.rd_delta)} (SE {seOf(computed.var_rd_delta)}) &nbsp; log-RR gap change = {fmt(computed.lnrr_delta)} (SE {seOf(computed.var_lnrr_delta)})</div>}
              {computed.compute_note && <div>{computed.compute_note}</div>}
            </>
          )}
        </div>
      </div>

      <div className="row mt">
        <div><label>Page<Help text="Page of the PDF where the numbers appear." /></label><N k="page" /></div>
        <div><label>Table or figure</label><input value={v.source_label} onChange={(e) => set("source_label", e.target.value)} placeholder="e.g. Table 3" style={{ width: 160 }} /></div>
      </div>
      <div className="mt">
        <label className="block">Verbatim source<Help text="The sentence or table cells the numbers were taken from, copied exactly. Required for verification." /></label>
        <textarea value={v.quote} onChange={(e) => set("quote", e.target.value)} />
      </div>
      <div className="mt">
        <label className="block">Notes</label>
        <textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} style={{ minHeight: 50 }} placeholder="Anything the verifier should know (adjusted vs. unadjusted, imputed SD, which comparison condition)" />
      </div>
      {err && <div className="err">{err}</div>}
      <div className="mt">
        <button className="primary" onClick={save} disabled={pending}>{effect ? "Save changes" : "Save effect"}</button>{" "}
        <button onClick={onCancel} disabled={pending}>Cancel</button>
      </div>
    </fieldset>
  );
}
