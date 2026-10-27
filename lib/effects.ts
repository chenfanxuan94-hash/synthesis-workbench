// Gap-change effect size computation.
//
// Estimand: delta = tau_m - tau_c, where tau_g is the program's effect for group g
// (m = marginalized group, c = comparison group). delta equals the change in the
// between-group gap in the treatment arm relative to the control arm, and equals the
// treatment-by-group interaction. Everything is oriented so that positive delta means
// the marginalized group benefited more, i.e. the gap narrowed.
//
// Continuous outcomes: standardized mean differences using one common SD, the pooled
// control-arm SD across both groups, so that gap change is not confounded with
// group differences in variance. Hedges' small-sample correction is applied.
// Binary outcomes: risk difference (absolute), log risk ratio (relative), and a
// log-odds-ratio-to-d conversion so binary rows can share the SMD scale.

export type EffectNumbers = {
  outcome_type: "continuous" | "binary";
  higher_is_worse: boolean;
  tier: "cells" | "subgroup" | "interaction";
  m_t_n?: number | null; m_t_mean?: number | null; m_t_sd?: number | null; m_t_events?: number | null;
  m_c_n?: number | null; m_c_mean?: number | null; m_c_sd?: number | null; m_c_events?: number | null;
  c_t_n?: number | null; c_t_mean?: number | null; c_t_sd?: number | null; c_t_events?: number | null;
  c_c_n?: number | null; c_c_mean?: number | null; c_c_sd?: number | null; c_c_events?: number | null;
  sg_d_m?: number | null; sg_se_m?: number | null; sg_d_c?: number | null; sg_se_c?: number | null;
  int_coef?: number | null; int_se?: number | null; int_scale?: string | null;
};

export type Computed = {
  g_m: number | null; var_m: number | null;
  g_c: number | null; var_c: number | null;
  delta: number | null; var_delta: number | null;
  rd_delta: number | null; var_rd_delta: number | null;
  lnrr_delta: number | null; var_lnrr_delta: number | null;
  compute_note: string | null;
};

const empty: Computed = {
  g_m: null, var_m: null, g_c: null, var_c: null,
  delta: null, var_delta: null,
  rd_delta: null, var_rd_delta: null,
  lnrr_delta: null, var_lnrr_delta: null,
  compute_note: null,
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function finite(v: number): boolean {
  return Number.isFinite(v);
}

function r(v: number | null, d = 6): number | null {
  if (v === null || !finite(v)) return null;
  return Number(v.toFixed(d));
}

function hedgesJ(df: number): number {
  return df > 1 ? 1 - 3 / (4 * df - 1) : 1;
}

export function computeEffect(e: EffectNumbers): Computed {
  const sign = e.higher_is_worse ? -1 : 1;
  const notes: string[] = [];

  if (e.tier === "interaction") {
    const coef = num(e.int_coef);
    const se = num(e.int_se);
    if (coef === null || se === null) return { ...empty, compute_note: "Interaction coefficient and SE are required." };
    if (e.int_scale !== "standardized") notes.push("Interaction coefficient is on the raw outcome scale; not comparable to SMD rows without conversion.");
    return {
      ...empty,
      delta: r(sign * coef),
      var_delta: r(se * se),
      compute_note: notes.join(" ") || null,
    };
  }

  if (e.tier === "subgroup") {
    const dm = num(e.sg_d_m), sem = num(e.sg_se_m), dc = num(e.sg_d_c), sec = num(e.sg_se_c);
    if (dm === null || sem === null || dc === null || sec === null) {
      return { ...empty, compute_note: "Both group effect sizes and their SEs are required." };
    }
    const g_m = sign * dm, g_c = sign * dc;
    const var_m = sem * sem, var_c = sec * sec;
    return {
      ...empty,
      g_m: r(g_m), var_m: r(var_m), g_c: r(g_c), var_c: r(var_c),
      delta: r(g_m - g_c), var_delta: r(var_m + var_c),
      compute_note: null,
    };
  }

  // tier === "cells"
  const mtn = num(e.m_t_n), mcn = num(e.m_c_n), ctn = num(e.c_t_n), ccn = num(e.c_c_n);
  if (mtn === null || mcn === null || ctn === null || ccn === null) {
    return { ...empty, compute_note: "Sample sizes for all four cells are required." };
  }

  if (e.outcome_type === "continuous") {
    const mtm = num(e.m_t_mean), mcm = num(e.m_c_mean), ctm = num(e.c_t_mean), ccm = num(e.c_c_mean);
    const mcsd = num(e.m_c_sd), ccsd = num(e.c_c_sd);
    if (mtm === null || mcm === null || ctm === null || ccm === null) {
      return { ...empty, compute_note: "Means for all four cells are required." };
    }
    let S: number | null = null;
    if (mcsd !== null && ccsd !== null && mcn + ccn > 2) {
      S = Math.sqrt(((mcn - 1) * mcsd * mcsd + (ccn - 1) * ccsd * ccsd) / (mcn + ccn - 2));
    } else if (mcsd !== null) {
      S = mcsd; notes.push("Only the marginalized-group control SD was available; used as the common SD.");
    } else if (ccsd !== null) {
      S = ccsd; notes.push("Only the comparison-group control SD was available; used as the common SD.");
    }
    if (S === null || !finite(S) || S <= 0) {
      return { ...empty, compute_note: "A control-arm SD is required to standardize." };
    }
    const d_m = (mtm - mcm) / S;
    const d_c = (ctm - ccm) / S;
    const J_m = hedgesJ(mtn + mcn - 2);
    const J_c = hedgesJ(ctn + ccn - 2);
    const g_m = sign * J_m * d_m;
    const g_c = sign * J_c * d_c;
    const var_m = (mtn + mcn) / (mtn * mcn) + (g_m * g_m) / (2 * (mtn + mcn));
    const var_c = (ctn + ccn) / (ctn * ccn) + (g_c * g_c) / (2 * (ctn + ccn));
    return {
      ...empty,
      g_m: r(g_m), var_m: r(var_m), g_c: r(g_c), var_c: r(var_c),
      delta: r(g_m - g_c), var_delta: r(var_m + var_c),
      compute_note: notes.join(" ") || null,
    };
  }

  // binary cells
  const mte = num(e.m_t_events), mce = num(e.m_c_events), cte = num(e.c_t_events), cce = num(e.c_c_events);
  if (mte === null || mce === null || cte === null || cce === null) {
    return { ...empty, compute_note: "Event counts for all four cells are required." };
  }
  const anyZero = [mte, mce, cte, cce].some((x) => x === 0) ||
    [mtn - mte, mcn - mce, ctn - cte, ccn - cce].some((x) => x === 0);
  const cc = anyZero ? 0.5 : 0;
  if (anyZero) notes.push("A zero cell was present; 0.5 continuity correction applied to ratio measures.");

  const p = (ev: number, n: number) => (ev + cc) / (n + 2 * cc);
  const p_mt = p(mte, mtn), p_mc = p(mce, mcn), p_ct = p(cte, ctn), p_cc = p(cce, ccn);

  // risk difference (uncorrected proportions)
  const rd_m = sign * (mte / mtn - mce / mcn);
  const rd_c = sign * (cte / ctn - cce / ccn);
  const vrd = (ev: number, n: number) => { const q = ev / n; return (q * (1 - q)) / n; };
  const var_rd_m = vrd(mte, mtn) + vrd(mce, mcn);
  const var_rd_c = vrd(cte, ctn) + vrd(cce, ccn);

  // log risk ratio
  const lnrr_m = sign * Math.log(p_mt / p_mc);
  const lnrr_c = sign * Math.log(p_ct / p_cc);
  const vln = (ev: number, n: number) => 1 / (ev + cc) - 1 / (n + cc);
  const var_lnrr_m = vln(mte, mtn) + vln(mce, mcn);
  const var_lnrr_c = vln(cte, ctn) + vln(cce, ccn);

  // log odds ratio converted to d (Cox / Hasselblad-Hedges): d = lnOR * sqrt(3) / pi
  const lnor = (pt: number, pc: number) => Math.log((pt / (1 - pt)) / (pc / (1 - pc)));
  const vlnor = (ev: number, n: number) => 1 / (ev + cc) + 1 / (n - ev + cc);
  const k = Math.sqrt(3) / Math.PI;
  const g_m = sign * lnor(p_mt, p_mc) * k;
  const g_c = sign * lnor(p_ct, p_cc) * k;
  const var_m = (vlnor(mte, mtn) + vlnor(mce, mcn)) * k * k;
  const var_c = (vlnor(cte, ctn) + vlnor(cce, ccn)) * k * k;
  notes.push("SMD columns for binary outcomes are log-odds-ratio conversions (d = lnOR x sqrt(3)/pi).");

  return {
    g_m: r(g_m), var_m: r(var_m), g_c: r(g_c), var_c: r(var_c),
    delta: r(g_m - g_c), var_delta: r(var_m + var_c),
    rd_delta: r(rd_m - rd_c), var_rd_delta: r(var_rd_m + var_rd_c),
    lnrr_delta: r(lnrr_m - lnrr_c), var_lnrr_delta: r(var_lnrr_m + var_lnrr_c),
    compute_note: notes.join(" ") || null,
  };
}

export function se(v: number | null): number | null {
  return v === null || v < 0 ? null : Math.sqrt(v);
}
