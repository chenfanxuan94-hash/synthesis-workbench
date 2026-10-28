"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Help from "./Help";
import { aiPrescreen, saveScreenCriteria, clearAiScreen } from "@/lib/actions";

// Optional help for step 1: the AI reads every unscreened title and abstract against the team's
// written criteria and leaves a hint (likely / unlikely / unclear) on each candidate.
export default function AiScreen({ criteria, left, aiReady, done }: { criteria: string; left: number; aiReady: boolean; done: number }) {
  const [text, setText] = useState(criteria);
  const [saved, setSaved] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [err, setErr] = useState("");
  const stop = useRef(false);
  const router = useRouter();

  async function save() {
    const r = await saveScreenCriteria(text);
    setSaved(r.ok ? "Criteria saved for the whole team." : "Could not save: " + r.error);
  }

  async function run() {
    setRunning(true); setErr(""); stop.current = false;
    let total = 0;
    try {
      if (text !== criteria) { const r = await saveScreenCriteria(text); if (!r.ok) { setErr(r.error); return; } }
      for (let i = 0; i < 200 && !stop.current; i++) {
        setProgress(`Reading the next batch... ${total} done so far.`);
        const r = await aiPrescreen(25);
        if (!r.ok) { setErr(r.error); break; }
        total += r.done;
        setProgress(`${total} candidates pre-screened, ${r.left} to go.`);
        if (r.left === 0 || r.done === 0) break;
        router.refresh();
      }
    } catch (e: any) {
      setErr("Something went wrong: " + (e?.message || "unknown error"));
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  async function reset() {
    if (!confirm("Forget every AI hint on the search list? You can run the pre-screen again afterwards.")) return;
    const r = await clearAiScreen();
    if (!r.ok) setErr(r.error);
    router.refresh();
  }

  return (
    <details className="howto aiscreen">
      <summary>
        AI pre-screen <span className="muted">(optional: a hint next to each candidate, you still decide)</span>
        {done > 0 && <span className="muted"> &middot; {done} hinted{left > 0 ? `, ${left} not yet` : ""}</span>}
      </summary>
      <p>
        The AI reads each title and abstract against the criteria below and marks it <b>likely</b>, <b>unlikely</b> or <b>unclear</b>, with one line saying why.
        Use the hints to sort: screen the likely ones first, spot-check the unlikely ones before marking them Not relevant in bulk.
        The hint is never a decision; nothing moves until a person marks it.
        <Help text="Costs about a cent per candidate. The criteria are shared by the whole team; edit them here and save. If you change them, clear the hints and run again." />
      </p>
      <label className="block">Inclusion criteria the AI checks against</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 170 }} disabled={running} />
      <div className="row mt" style={{ alignItems: "center" }}>
        <button onClick={save} disabled={running}>Save criteria</button>
        <button className="primary" onClick={run} disabled={running || !aiReady || left === 0} title={!aiReady ? "AI is not set up: add ANTHROPIC_API_KEY in Vercel" : left === 0 ? "Every candidate already has a hint" : ""}>
          {running ? "Reading..." : `Pre-screen the ${left} candidate${left === 1 ? "" : "s"} without a hint`}
        </button>
        {running && <button onClick={() => { stop.current = true; }}>Stop after this batch</button>}
        {done > 0 && !running && <button className="link" onClick={reset}>Clear all hints</button>}
        {saved && <span className="muted">{saved}</span>}
      </div>
      {progress && <p className="muted" style={{ margin: "8px 0 0" }}>{progress}</p>}
      {err && <div className="err mt">{err}</div>}
    </details>
  );
}
