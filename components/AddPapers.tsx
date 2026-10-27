"use client";

import { useState } from "react";
import Link from "next/link";
import Help from "./Help";
import { createPaper, importPapers, signedUpload, finalizeUpload } from "@/lib/actions";
import { parseRIS, papersFromCSV, cleanDOI, type ParsedPaper } from "@/lib/parsers";

type Mode = "upload" | "doi" | "import" | "manual";

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

export default function AddPapers() {
  const [mode, setMode] = useState<Mode>("upload");
  return (
    <div>
      <div className="tabs mb">
        {(["upload", "doi", "import", "manual"] as Mode[]).map((m) => (
          <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
            {m === "upload" ? "Upload PDFs" : m === "doi" ? "By DOI" : m === "import" ? "Import RIS or CSV" : "Manual entry"}
          </button>
        ))}
      </div>
      {mode === "upload" && <Upload />}
      {mode === "doi" && <ByDOI />}
      {mode === "import" && <Import />}
      {mode === "manual" && <Manual />}
    </div>
  );
}

function SourceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label>
        Source
        <Help text="Where this record came from. Seed lists are the included-study lists of the prior meta-analyses; database searches update coverage. The source is kept with every paper so the PRISMA flow can be reconstructed." />
      </label>
      <input list="sources" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 300 }} />
      <datalist id="sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function Upload() {
  const [source, setSource] = useState("upload");
  const [log, setLog] = useState<{ name: string; status: string; id?: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const list = Array.from(files);
    setLog(list.map((f) => ({ name: f.name, status: "waiting" })));
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      const upd = (status: string, id?: string) =>
        setLog((prev) => prev.map((x, j) => (j === i ? { ...x, status, id } : x)));
      try {
        upd("uploading");
        const { path, url } = await signedUpload(f.name);
        const res = await fetch(url, { method: "PUT", body: f, headers: { "Content-Type": "application/pdf", "x-upsert": "false" } });
        if (!res.ok) throw new Error(`storage ${res.status}`);
        upd("reading text and looking up metadata");
        const r = await finalizeUpload(path, f.name);
        upd(r.duplicate ? "already in library (PDF attached if it had none)" : "added", r.id);
      } catch (e: any) {
        upd("failed: " + (e?.message || "unknown error"));
      }
    }
    setBusy(false);
  }

  return (
    <div className="stack">
      <p>
        Upload one or more PDFs. The text is extracted for the reading pane, the DOI is detected when present, and the title, authors, year and journal are filled from Crossref.
        <Help text="Files go straight to private storage from your browser, so size limits of the web server do not apply. Text extraction works for born-digital PDFs; scanned PDFs without a text layer will show an empty Text tab, and the PDF tab still works." />
      </p>
      <div className="row">
        <SourceSelect value={source} onChange={setSource} />
        <div>
          <label>PDF files</label>
          <input type="file" accept="application/pdf" multiple disabled={busy} onChange={(e) => handle(e.target.files)} />
        </div>
      </div>
      {log.length > 0 && (
        <table className="grid" style={{ maxWidth: 800 }}>
          <thead><tr><th>File</th><th>Status</th></tr></thead>
          <tbody>
            {log.map((l, i) => (
              <tr key={i}>
                <td>{l.name}</td>
                <td>{l.id ? <Link href={`/papers/${l.id}`}>{l.status} - open</Link> : l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ByDOI() {
  const [doi, setDoi] = useState("");
  const [source, setSource] = useState("");
  const [hit, setHit] = useState<ParsedPaper | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookup() {
    setBusy(true); setMsg(""); setHit(null);
    const r = await fetch(`/api/crossref?doi=${encodeURIComponent(cleanDOI(doi))}`);
    const j = await r.json();
    if (j?.hit) setHit(j.hit); else setMsg("No record found for that DOI.");
    setBusy(false);
  }
  const [lastId, setLastId] = useState<string | null>(null);
  async function add() {
    if (!hit) return;
    setBusy(true);
    const r = await createPaper({ ...hit, source: source || "doi lookup" });
    setLastId(r.id);
    setMsg(`${r.duplicate ? "Already in the library" : "Added"}: `);
    setHit(null);
    setDoi("");
    setBusy(false);
  }

  return (
    <div className="stack">
      <div className="row">
        <div>
          <label>DOI</label>
          <input value={doi} onChange={(e) => setDoi(e.target.value)} placeholder="10.1234/abcd or https://doi.org/..." style={{ width: 360 }} />
        </div>
        <SourceSelect value={source} onChange={setSource} />
        <button onClick={lookup} disabled={busy || !doi.trim()}>Look up</button>
      </div>
      {hit && (
        <div className="card">
          <p><b>{hit.title}</b></p>
          <p>{hit.authors}</p>
          <p>{hit.journal} {hit.year ?? ""}</p>
          <button className="primary" onClick={add} disabled={busy}>Add to library</button>
        </div>
      )}
      {msg && <p>{msg}{lastId && <Link href={`/papers/${lastId}`}>here</Link>}</p>}
    </div>
  );
}

function Import() {
  const [source, setSource] = useState("");
  const [rows, setRows] = useState<ParsedPaper[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function read(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsed = file.name.toLowerCase().endsWith(".ris") || /^TY\s{2}-/m.test(text) ? parseRIS(text) : papersFromCSV(text);
    setRows(parsed);
    setMsg(parsed.length ? `${parsed.length} records parsed. Review, then import.` : "No records recognised. RIS needs TY/TI/AU lines; CSV needs a header row with a title column.");
  }
  async function run() {
    setBusy(true);
    const r = await importPapers(rows, source || "import");
    setMsg(`Imported ${r.added}. Skipped ${r.skipped} already in the library (matched by DOI or title).`);
    setRows([]);
    setBusy(false);
  }

  return (
    <div className="stack">
      <p>
        Import a database export (RIS from PsycINFO, ERIC, PubMed, ProQuest, Zotero) or a CSV with a header row.
        <Help text="Recognised CSV columns: title, authors, year, journal (or source), doi, abstract. Duplicates are skipped by DOI, then by exact title. PDFs can be attached later from each paper's Info tab." />
      </p>
      <div className="row">
        <SourceSelect value={source} onChange={setSource} />
        <div>
          <label>File</label>
          <input type="file" accept=".ris,.txt,.csv" onChange={(e) => read(e.target.files?.[0])} />
        </div>
        {rows.length > 0 && <button className="primary" onClick={run} disabled={busy}>Import {rows.length} papers</button>}
      </div>
      {msg && <p>{msg}</p>}
      {rows.length > 0 && (
        <table className="grid">
          <thead><tr><th>Title</th><th>Authors</th><th>Year</th><th>Journal</th><th>DOI</th></tr></thead>
          <tbody>
            {rows.slice(0, 200).map((r, i) => (
              <tr key={i}><td>{r.title}</td><td>{r.authors}</td><td>{r.year ?? ""}</td><td>{r.journal}</td><td>{r.doi}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Manual() {
  const [p, setP] = useState<ParsedPaper>({ title: "", authors: "", year: null, journal: "", doi: "", abstract: "" });
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
    setMsg(r.duplicate ? "Already in the library: " : "Added: ");
    if (!r.duplicate) setP({ title: "", authors: "", year: null, journal: "", doi: "", abstract: "" });
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <div>
        <label className="block">Title</label>
        <input value={p.title} onChange={(e) => set("title", e.target.value)} style={{ width: "100%" }} />
        <button className="small mt" onClick={search} disabled={!p.title.trim()}>Find on Crossref</button>
      </div>
      {hits.length > 0 && (
        <table className="grid">
          <tbody>
            {hits.map((h, i) => (
              <tr key={i}>
                <td>{h.title}<div>{h.authors} - {h.journal} {h.year ?? ""}</div></td>
                <td><button className="small" onClick={() => { setP(h); setHits([]); }}>Use</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>
        <label className="block">Authors<Help text="Semicolon-separated, surname first: Smith, J.; Lee, A." /></label>
        <input value={p.authors} onChange={(e) => set("authors", e.target.value)} style={{ width: "100%" }} />
      </div>
      <div className="row">
        <div><label>Year</label><input type="number" value={p.year ?? ""} onChange={(e) => set("year", e.target.value ? Number(e.target.value) : null)} /></div>
        <div><label>Journal</label><input value={p.journal} onChange={(e) => set("journal", e.target.value)} style={{ width: 300 }} /></div>
        <div><label>DOI</label><input value={p.doi} onChange={(e) => set("doi", e.target.value)} style={{ width: 240 }} /></div>
      </div>
      <SourceSelect value={source} onChange={setSource} />
      <div>
        <label className="block">Abstract</label>
        <textarea value={p.abstract} onChange={(e) => set("abstract", e.target.value)} />
      </div>
      <div><button className="primary" onClick={save} disabled={!p.title.trim() && !p.doi.trim()}>Add to library</button></div>
      {msg && <p>{msg}{lastId && <Link href={`/papers/${lastId}`}>open</Link>}</p>}
    </div>
  );
}
