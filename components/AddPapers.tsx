"use client";

import { useState } from "react";
import Link from "next/link";
import Help from "./Help";
import DropZone from "./DropZone";
import { createPaper, importPapers, signedUpload, finalizeUpload } from "@/lib/actions";
import { parseRIS, papersFromCSV, cleanDOI, type ParsedPaper } from "@/lib/parsers";

type Mode = "upload" | "doi" | "import" | "manual";

const TABS: { key: Mode; label: string }[] = [
  { key: "upload", label: "Upload PDFs" },
  { key: "doi", label: "By DOI" },
  { key: "import", label: "Import RIS or CSV" },
  { key: "manual", label: "Manual entry" },
];

const SOURCES = [
  "seed: Durlak et al. 2011",
  "seed: Sanchez et al. 2018",
  "seed: Zhang et al. 2023",
  "seed: Cipriano et al. 2023",
  "seed: Hall et al. 2016",
  "search: PsycINFO",
  "search: ERIC",
  "search: PubMed",
  "search: ProQuest Dissertations",
  "hand search or reference list",
  "author contact",
];

// onAdded fires after every successful add, so the list behind the window can reload.
export default function AddPapers({ onAdded }: { onAdded?: () => void }) {
  const [mode, setMode] = useState<Mode>("upload");
  const added = () => onAdded?.();
  return (
    <div>
      <div className="seg" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={mode === t.key} className={mode === t.key ? "on" : ""} onClick={() => setMode(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {mode === "upload" && <Upload onAdded={added} />}
      {mode === "doi" && <ByDOI onAdded={added} />}
      {mode === "import" && <Import onAdded={added} />}
      {mode === "manual" && <Manual onAdded={added} />}
    </div>
  );
}

function SourceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="sourceline">
      <span>Source</span>
      <input list="sources" value={value} onChange={(e) => onChange(e.target.value)} />
      <datalist id="sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
      <Help text="Where this paper came from, for example a seed list or a database search. It is kept with every paper so the PRISMA flow can be rebuilt later. Papers already in the library are skipped automatically." />
    </div>
  );
}

type Row = { name: string; status: string; kind: "wait" | "work" | "ok" | "dup" | "fail"; id?: string };

function Upload({ onAdded }: { onAdded: () => void }) {
  const [source, setSource] = useState("upload");
  const [log, setLog] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);

  async function handle(list: File[]) {
    if (list.length === 0) return;
    setBusy(true);
    setLog(list.map((f) => ({ name: f.name, status: "waiting", kind: "wait" })));
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const upd = (status: string, kind: Row["kind"], id?: string) =>
        setLog((prev) => prev.map((x, j) => (j === i ? { ...x, status, kind, id } : x)));
      try {
        upd("uploading", "work");
        const link = await signedUpload(f.name);
        if (!link.ok) throw new Error(link.error);
        const res = await fetch(link.url, { method: "PUT", body: f, headers: { "Content-Type": "application/pdf", "x-upsert": "false" } });
        if (!res.ok) throw new Error(`the file was not accepted by storage (${res.status})`);
        upd("reading the text and looking up the title", "work");
        const r = await finalizeUpload(link.path, f.name, undefined, source);
        if (!r.ok) throw new Error(r.error);
        const tail = r.textRead ? "" : " (no text could be read, probably a scan; use the PDF view)";
        if (r.duplicate) upd("already in the library" + tail, "dup", r.id);
        else upd("added" + tail, "ok", r.id);
        onAdded();
      } catch (e: any) {
        upd("failed: " + (e?.message || "unknown error"), "fail");
      }
    }
    setBusy(false);
  }

  return (
    <div>
      <DropZone
        size="big"
        accept="application/pdf"
        multiple
        disabled={busy}
        title={busy ? "Adding your papers..." : "Drop PDF files here"}
        hint={busy ? "Please keep this page open until every file shows a check mark." : "or click to choose them from your computer. You can pick many at once."}
        onFiles={handle}
      />
      <SourceSelect value={source} onChange={setSource} />
      {log.length > 0 && (
        <ul className="uplist">
          {log.map((l, i) => (
            <li key={i} className={l.kind}>
              <span className="ico">{l.kind === "ok" ? <>&#10003;</> : l.kind === "fail" ? <>&#10005;</> : l.kind === "dup" ? <>&bull;</> : <>&hellip;</>}</span>
              <span className="fn">{l.name}</span>
              <span className="st">{l.status}</span>
              {l.id && <Link href={`/papers/${l.id}`}>Open</Link>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ByDOI({ onAdded }: { onAdded: () => void }) {
  const [doi, setDoi] = useState("");
  const [source, setSource] = useState("");
  const [hit, setHit] = useState<ParsedPaper | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  async function lookup() {
    setBusy(true); setMsg(""); setHit(null); setLastId(null);
    const r = await fetch(`/api/crossref?doi=${encodeURIComponent(cleanDOI(doi))}`);
    const j = await r.json();
    if (j?.hit) setHit(j.hit); else setMsg("No record found for that DOI.");
    setBusy(false);
  }
  async function add() {
    if (!hit) return;
    setBusy(true);
    const r = await createPaper({ ...hit, source: source || "doi lookup" });
    setLastId(r.id);
    if (!r.duplicate) onAdded();
    setMsg(r.duplicate ? "Already in the library. " : "Added. ");
    setHit(null);
    setDoi("");
    setBusy(false);
  }

  return (
    <div className="stack">
      <div>
        <label className="block" style={{ marginTop: 0 }}>Paste a DOI or a doi.org link</label>
        <div className="row" style={{ alignItems: "stretch", flexWrap: "nowrap" }}>
          <input className="bigfield" value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.1234/abcd" onKeyDown={(e) => { if (e.key === "Enter" && doi.trim() && !busy) lookup(); }} />
          <button className="primary big" style={{ flex: "none", whiteSpace: "nowrap" }} onClick={lookup} disabled={busy || !doi.trim()}>Look up</button>
        </div>
      </div>
      {hit && (
        <div className="card">
          <p style={{ fontSize: 19 }}><b>{hit.title}</b></p>
          <p className="muted">{hit.authors}</p>
          <p className="muted">{hit.journal} {hit.year ?? ""}</p>
          <button className="primary big" onClick={add} disabled={busy}>Add to library</button>
        </div>
      )}
      {msg && <p style={{ fontSize: 18 }}>{msg}{lastId && <Link href={`/papers/${lastId}`}>Open it</Link>}</p>}
      <SourceSelect value={source} onChange={setSource} />
    </div>
  );
}

function Import({ onAdded }: { onAdded: () => void }) {
  const [source, setSource] = useState("");
  const [rows, setRows] = useState<ParsedPaper[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function read(files: File[]) {
    const file = files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = file.name.toLowerCase().endsWith(".ris") || /^TY\s{2}-/m.test(text) ? parseRIS(text) : papersFromCSV(text);
    setRows(parsed);
    setMsg(parsed.length ? `${parsed.length} records found. Look them over, then import.` : "No records recognised. A RIS file needs TY, TI and AU lines; a CSV needs a header row with a title column.");
  }
  async function run() {
    setBusy(true);
    const r = await importPapers(rows, source || "import");
    setMsg(`Imported ${r.added}. Skipped ${r.skipped} already in the library.`);
    if (r.added > 0) onAdded();
    setRows([]);
    setBusy(false);
  }

  return (
    <div className="stack">
      <DropZone
        size="normal"
        accept=".ris,.txt,.csv"
        title="Drop an RIS or CSV file here"
        hint="Exported from PsycINFO, ERIC, PubMed, ProQuest or Zotero. Or click to choose a file."
        onFiles={read}
      />
      <SourceSelect value={source} onChange={setSource} />
      {msg && <p style={{ fontSize: 18 }}>{msg}</p>}
      {rows.length > 0 && (
        <>
          <button className="primary big" onClick={run} disabled={busy}>Import {rows.length} papers</button>
          <table className="grid">
            <thead><tr><th>Title</th><th>Authors</th><th>Year</th><th>Journal</th></tr></thead>
            <tbody>
              {rows.slice(0, 200).map((r, i) => (
                <tr key={i}><td>{r.title}</td><td>{r.authors}</td><td>{r.year ?? ""}</td><td>{r.journal}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function Manual({ onAdded }: { onAdded: () => void }) {
  const empty: ParsedPaper = { title: "", authors: "", year: null, journal: "", doi: "", abstract: "" };
  const [p, setP] = useState<ParsedPaper>(empty);
  const [source, setSource] = useState("");
  const [msg, setMsg] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);
  const [hits, setHits] = useState<ParsedPaper[]>([]);
  const set = (k: keyof ParsedPaper, v: any) => setP((x) => ({ ...x, [k]: v }));

  async function search() {
    const r = await fetch(`/api/crossref?q=${encodeURIComponent(p.title)}`);
    const j = await r.json();
    setHits(j?.hits || []);
  }
  async function save() {
    const r = await createPaper({ ...p, source: source || "manual" });
    setLastId(r.id);
    if (!r.duplicate) onAdded();
    setMsg(r.duplicate ? "Already in the library. " : "Added. ");
    if (!r.duplicate) setP(empty);
  }

  return (
    <div className="stack">
      <div>
        <label className="block" style={{ marginTop: 0 }}>Title</label>
        <input className="bigfield" value={p.title} onChange={(e) => set("title", e.target.value)} />
        <button className="small mt" onClick={search} disabled={!p.title.trim()}>Find it on Crossref</button>
      </div>
      {hits.length > 0 && (
        <table className="grid">
          <tbody>
            {hits.map((h, i) => (
              <tr key={i}>
                <td>{h.title}<div className="sub">{h.authors} - {h.journal} {h.year ?? ""}</div></td>
                <td><button className="small" onClick={() => { setP(h); setHits([]); }}>Use this</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <label className="block" style={{ marginTop: 0 }}>Authors<Help text="Semicolon-separated, surname first: Smith, J.; Lee, A." /></label>
        <input value={p.authors} onChange={(e) => set("authors", e.target.value)} style={{ width: "100%" }} />
      </div>
      <div className="row">
        <div><label>Year</label><input type="number" value={p.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><label>Journal</label><input value={p.journal} onChange={(e) => set("journal", e.target.value)} style={{ width: 320 }} /></div>
        <div><label>DOI</label><input value={p.doi} onChange={(e) => set("doi", e.target.value)} style={{ width: 260 }} /></div>
      </div>
      <div>
        <label className="block" style={{ marginTop: 0 }}>Abstract</label>
        <textarea value={p.abstract} onChange={(e) => set("abstract", e.target.value)} style={{ minHeight: 120 }} />
      </div>
      <div><button className="primary big" onClick={save} disabled={!p.title.trim() && !p.doi.trim()}>Add to library</button></div>
      {msg && <p style={{ fontSize: 18 }}>{msg}{lastId && <Link href={`/papers/${lastId}`}>Open it</Link>}</p>}
      <SourceSelect value={source} onChange={setSource} />
    </div>
  );
}
