"use client";

import { useEffect, useState } from "react";
import Help from "./Help";
import DropZone from "./DropZone";
import { draftEffects } from "@/lib/actions";
import type { DraftResult } from "@/lib/ai";

type Mode = "image" | "text";

// Shrinks a screenshot so it travels fast and stays under the request limit, as PNG when
// small enough (sharper digits), otherwise JPEG.
async function prepareImage(file: Blob): Promise<{ data: string; media: string; preview: string }> {
  const bmp = await createImageBitmap(file);
  const max = 2000;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  let url = canvas.toDataURL("image/png");
  let media = "image/png";
  if (url.length > 3_400_000) { url = canvas.toDataURL("image/jpeg", 0.92); media = "image/jpeg"; }
  return { data: url.slice(url.indexOf(",") + 1), media, preview: url };
}

export default function AiDraft({ paperId, pageCount, onResult, onClose }: {
  paperId: string; pageCount: number; onResult: (r: Extract<DraftResult, { ok: true }>) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("image");
  const [img, setImg] = useState<{ data: string; media: string; preview: string } | null>(null);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.max(1, pageCount));
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // A screenshot pasted anywhere on the page lands here while this panel is open.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items || []);
      const it = items.find((x) => x.type.startsWith("image/"));
      const f = it?.getAsFile();
      if (f) { e.preventDefault(); take(f); }
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);

  async function take(f: Blob) {
    setErr("");
    try { setImg(await prepareImage(f)); setMode("image"); }
    catch { setErr("That image could not be read. Try a PNG or JPEG screenshot."); }
  }

  async function run() {
    setErr("");
    if (mode === "image" && !img) { setErr("Add a screenshot first: paste it, drop it, or click the box to choose it."); return; }
    setBusy(true);
    try {
      const r = await draftEffects(paperId, {
        image: mode === "image" ? { data: img!.data, media: img!.media } : null,
        pages: mode === "text" ? { from, to } : null,
        hint,
      });
      if (!r.ok) { setErr(r.error); return; }
      onResult(r);
    } catch (e: any) {
      setErr("Something went wrong: " + (e?.message || "unknown error") + ". Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="aipanel">
      <div className="aihead">
        <b>Let Claude draft the rows</b>
        <Help text="Claude reads the table and fills in the form fields for you. It only copies what is printed; it never calculates. You still check every number against the paper before saving, and each saved row is marked as drafted by Claude." />
        <button className="link" style={{ marginLeft: "auto" }} onClick={onClose}>close</button>
      </div>
      <div className="aimodes">
        <label className="inline"><input type="radio" checked={mode === "image"} onChange={() => setMode("image")} /> From a screenshot of the results table (best)</label>
        <label className="inline" title={pageCount === 0 ? "This paper has no readable text" : ""}>
          <input type="radio" checked={mode === "text"} onChange={() => setMode("text")} disabled={pageCount === 0} /> From the paper&apos;s text
        </label>
      </div>

      {mode === "image" && (
        <div>
          {img ? (
            <div className="aipreview">
              <img src={img.preview} alt="Your screenshot" />
              <div><button className="small" onClick={() => setImg(null)} disabled={busy}>Use a different screenshot</button></div>
            </div>
          ) : (
            <DropZone
              size="small"
              accept="image/*"
              disabled={busy}
              title="Paste or drop a screenshot of the table"
              hint="Take a screenshot of the results table in the PDF (on a Mac: Shift-Command-4), then paste it here with Command-V, or click to choose the image file."
              onFiles={(fs) => take(fs[0])}
            />
          )}
        </div>
      )}
      {mode === "text" && (
        <div className="row" style={{ alignItems: "center" }}>
          <span>Read pages</span>
          <input type="number" min={1} max={pageCount} value={from} onChange={(e) => setFrom(Number(e.target.value) || 1)} style={{ width: 80 }} />
          <span>to</span>
          <input type="number" min={1} max={pageCount} value={to} onChange={(e) => setTo(Number(e.target.value) || pageCount)} style={{ width: 80 }} />
          <span className="muted">of {pageCount}. Fewer pages means a faster, more careful answer: the Results section and its tables are usually enough.</span>
        </div>
      )}

      <div className="mt">
        <label className="block" style={{ marginTop: 0 }}>Tell Claude what to look for (optional)</label>
        <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="for example: Table 3, sessions attended by race, post-test" style={{ width: "100%" }} />
      </div>
      {err && <div className="err">{err}</div>}
      <div className="row mt" style={{ alignItems: "center" }}>
        <button className="primary big" onClick={run} disabled={busy}>{busy ? "Reading... this takes 10 to 40 seconds" : "Draft the rows"}</button>
        {busy && <span className="muted">Please keep this page open.</span>}
      </div>
    </div>
  );
}
