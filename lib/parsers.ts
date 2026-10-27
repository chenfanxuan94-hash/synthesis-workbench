// Client-safe parsers: RIS, CSV, DOI, numbers-in-text.

export type ParsedPaper = {
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  doi: string;
  abstract: string;
};

export function cleanDOI(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = raw.trim();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  d = d.replace(/[.,;:)\]]+$/, "");
  return d.toLowerCase();
}

export function extractDOI(text: string): string {
  const m = text.match(/10\.\d{4,9}\/[^\s"'<>)\]]+/i);
  return m ? cleanDOI(m[0]) : "";
}

export function firstAuthor(authors: string | null | undefined): string {
  if (!authors) return "";
  const first = authors.split(/;|\band\b/)[0].trim();
  const last = first.includes(",") ? first.split(",")[0] : first.split(/\s+/).slice(-1)[0];
  return (last || "").trim();
}

export function parseRIS(text: string): ParsedPaper[] {
  const out: ParsedPaper[] = [];
  const records = text.split(/^ER\s{2}-.*$/m);
  for (const rec of records) {
    const lines = rec.split(/\r?\n/);
    const f: Record<string, string[]> = {};
    for (const line of lines) {
      const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
      if (!m) continue;
      (f[m[1]] ||= []).push(m[2].trim());
    }
    if (!f.TY) continue;
    const title = (f.TI || f.T1 || [""])[0];
    const authors = (f.AU || f.A1 || []).join("; ");
    const yearRaw = (f.PY || f.Y1 || [""])[0];
    const year = yearRaw ? parseInt(yearRaw.slice(0, 4), 10) : NaN;
    const journal = (f.JO || f.JF || f.T2 || f.JA || [""])[0];
    const doi = cleanDOI((f.DO || [""])[0]);
    const abstract = (f.AB || f.N2 || [""]).join(" ");
    if (!title && !doi) continue;
    out.push({ title, authors, year: Number.isFinite(year) ? year : null, journal, doi, abstract });
  }
  return out;
}

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); rows.push(row); row = []; cur = "";
    } else cur += ch;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function findCol(headers: string[], ...names: string[]): number {
  const h = headers.map((x) => x.toLowerCase().trim());
  for (const n of names) {
    const i = h.findIndex((x) => x === n || x.includes(n));
    if (i >= 0) return i;
  }
  return -1;
}

export function papersFromCSV(text: string): ParsedPaper[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const H = rows[0];
  const iT = findCol(H, "title", "article title");
  const iA = findCol(H, "authors", "author");
  const iY = findCol(H, "year", "publication year", "pub year");
  const iJ = findCol(H, "journal", "source title", "source", "publication title");
  const iD = findCol(H, "doi");
  const iAb = findCol(H, "abstract");
  const out: ParsedPaper[] = [];
  for (const r of rows.slice(1)) {
    const g = (i: number) => (i >= 0 && i < r.length ? r[i].trim() : "");
    const title = g(iT);
    const doi = cleanDOI(g(iD));
    if (!title && !doi) continue;
    const y = parseInt(g(iY).slice(0, 4), 10);
    out.push({ title, authors: g(iA), year: Number.isFinite(y) ? y : null, journal: g(iJ), doi, abstract: g(iAb) });
  }
  return out;
}

export function numbersIn(text: string): string[] {
  const cleaned = text.replace(/10\.\d{4,9}\/[^\s"'<>)\]]+/gi, " ").replace(/https?:\/\/\S+/gi, " ");
  const found = cleaned.match(/-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?|-?\.\d+/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const v = raw.replace(/,/g, "");
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out.slice(0, 40);
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  const s = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2);
  return s.toUpperCase();
}
