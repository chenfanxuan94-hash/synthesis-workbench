// Server-side literature search across the free databases that return titles and abstracts.
// Each provider turns one query into a list of hits in one shape; lib/search/run.ts merges them.
//
// Not here, because they have no public API: Google Scholar (blocks programs), PsycINFO, Scopus
// and Web of Science (paid licences). Export from those and use Import on the search page.

import { cleanDOI, extractDOI } from "../parsers";
import { DBS, DB_LABEL, type Db } from "./dbs";

export { DBS, DB_LABEL, OUTSIDE, isDb, type Db, type DbInfo } from "./dbs";

export type Hit = {
  db: Db;
  external_id: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  year: number | null;
  journal: string | null;
  doi: string | null;
  pmid: string | null;
  keywords: string[];
  cited_by: number | null;
  url: string | null;
  type: string | null;
};

export type DbResult = { db: Db; found: number; hits: Hit[]; error: string | null; capped: boolean };

export type SearchOpts = { limit: number; yearFrom?: number | null; yearTo?: number | null };

const TIMEOUT = 40_000;

// Tests point every provider at a local stand-in by setting SEARCH_TEST_BASE; production never sets it.
function endpoint(real: string, db: Db): string {
  const t = process.env.SEARCH_TEST_BASE;
  if (!t) return real;
  const u = new URL(real);
  return t.replace(/\/$/, "") + "/" + db + u.pathname + u.search;
}

export async function searchDb(db: Db, query: string, opts: SearchOpts): Promise<DbResult> {
  try {
    if (db === "pubmed") return await pubmed(query, opts);
    if (db === "openalex") return await openalex(query, opts);
    if (db === "eric") return await eric(query, opts);
    return await semanticScholar(query, opts);
  } catch (e: any) {
    return { db, found: 0, hits: [], error: humanError(DB_LABEL[db], e), capped: false };
  }
}

function humanError(label: string, e: any): string {
  const msg = String(e?.message || e || "unknown error");
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return `${label} did not answer in time. Try again, or a smaller limit.`;
  if (/\b429\b/.test(msg)) return `${label} is busy (it limits anonymous use). Wait a minute and try again.`;
  return `${label}: ${msg}`;
}

// ---------- shared helpers ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url: string, headers: Record<string, string> = {}): Promise<any> {
  let res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  if (res.status === 429) {
    await sleep(1500);
    res = await fetch(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}` + (res.status === 429 ? " (too many requests)" : ""));
  return res.json();
}

async function postText(url: string, body: URLSearchParams): Promise<string> {
  const res = await fetch(url, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}

function squash(s: string | null | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = squash(x);
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
  }
  return out;
}

// "Heather Piwowar" -> "Piwowar, Heather"; names already in surname-first form are kept.
export function lastFirst(name: string): string {
  const n = squash(name);
  if (!n || n.includes(",")) return n;
  const parts = n.split(" ");
  if (parts.length < 2) return n;
  const last = parts.pop()!;
  return `${last}, ${parts.join(" ")}`;
}

// Drops the full stop PubMed puts after a title, but not one that ends an abbreviation (U.S.).
function tidyTitle(t: string): string {
  const s = squash(decodeEntities(t));
  return s.length > 10 && /(?:[a-z]{2}|\d|\))\.$/i.test(s) && !/\.[A-Za-z]\.$/.test(s) && !/\.\.$/.test(s) ? s.slice(0, -1) : s;
}

function yearOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v || "").slice(0, 4), 10);
  return Number.isFinite(n) && n > 1800 && n < 2200 ? n : null;
}

// ---------- PubMed (NCBI E-utilities) ----------

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";

function ncbiParams(): Record<string, string> {
  const p: Record<string, string> = { tool: "chhsr-meta-analysis-portal" };
  if (process.env.CONTACT_EMAIL) p.email = process.env.CONTACT_EMAIL;
  if (process.env.NCBI_API_KEY) p.api_key = process.env.NCBI_API_KEY;
  return p;
}

async function pubmed(query: string, opts: SearchOpts): Promise<DbResult> {
  const p = new URLSearchParams({ db: "pubmed", retmode: "json", retmax: String(opts.limit), term: query, ...ncbiParams() });
  if (opts.yearFrom || opts.yearTo) {
    p.set("datetype", "pdat");
    p.set("mindate", String(opts.yearFrom || 1800));
    p.set("maxdate", String(opts.yearTo || 2200));
  }
  const j = await getJSON(endpoint(EUTILS + "esearch.fcgi?" + p.toString(), "pubmed"));
  const found = Number(j?.esearchresult?.count || 0);
  const ids: string[] = Array.isArray(j?.esearchresult?.idlist) ? j.esearchresult.idlist : [];
  const hits: Hit[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    if (i > 0) await sleep(process.env.NCBI_API_KEY ? 120 : 350);
    const body = new URLSearchParams({ db: "pubmed", retmode: "xml", id: ids.slice(i, i + 200).join(","), ...ncbiParams() });
    const xml = await postText(endpoint(EUTILS + "efetch.fcgi", "pubmed"), body);
    hits.push(...parsePubmedXML(xml));
  }
  return { db: "pubmed", found, hits, error: null, capped: found > ids.length };
}

function firstTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : "";
}

function allTags(block: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) out.push(m[1]);
  return out;
}

// Reads PubmedArticle records out of efetch XML. Inline formatting tags (<i>, <sup>) are dropped
// first so titles and abstracts keep their word order.
export function parsePubmedXML(xml: string): Hit[] {
  const clean = xml.replace(/<\/?(i|b|u|sup|sub|em|strong)\b[^>]*>/gi, "");
  const out: Hit[] = [];
  const re = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const a = m[1];
    const cit = firstTag(a, "MedlineCitation") || a;
    const pmid = squash(firstTag(cit, "PMID"));
    const art = firstTag(cit, "Article") || cit;
    const title = tidyTitle(firstTag(art, "ArticleTitle"));
    const abs = firstTag(art, "Abstract");
    const parts = allTags(abs, "AbstractText").map((t) => squash(decodeEntities(t)));
    const labels = (abs.match(/<AbstractText\b[^>]*>/g) || []).map((tag) => (tag.match(/Label="([^"]*)"/) || [])[1] || "");
    const abstract = parts.map((t, i) => (labels[i] && parts.length > 1 ? `${labels[i].charAt(0) + labels[i].slice(1).toLowerCase()}: ${t}` : t)).join(" ");
    const authors = allTags(firstTag(art, "AuthorList"), "Author").map((blk) => {
      const coll = squash(decodeEntities(firstTag(blk, "CollectiveName")));
      if (coll) return coll;
      const last = squash(decodeEntities(firstTag(blk, "LastName")));
      const fore = squash(decodeEntities(firstTag(blk, "ForeName") || firstTag(blk, "Initials")));
      return [last, fore].filter(Boolean).join(", ");
    }).filter(Boolean);
    const journalBlock = firstTag(art, "Journal");
    const journal = squash(decodeEntities(firstTag(journalBlock, "Title")));
    const pub = firstTag(journalBlock, "PubDate");
    const year = yearOf(firstTag(pub, "Year") || (firstTag(pub, "MedlineDate").match(/\d{4}/) || [])[0] || "");
    const doi = cleanDOI(
      (a.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/) || [])[1] ||
      (a.match(/<ELocationID EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/) || [])[1] || ""
    );
    const mesh = allTags(cit, "DescriptorName").map((x) => decodeEntities(x));
    const kws = allTags(cit, "Keyword").map((x) => decodeEntities(x));
    const types = allTags(art, "PublicationType").map((x) => decodeEntities(x));
    if (!title && !doi) continue;
    out.push({
      db: "pubmed", external_id: pmid, title, abstract: abstract || null, authors: authors.join("; ") || null, year,
      journal: journal || null, doi: doi || null, pmid: pmid || null, keywords: uniq([...kws, ...mesh]).slice(0, 30),
      cited_by: null, url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null, type: types.join("; ") || null,
    });
  }
  return out;
}

// ---------- OpenAlex ----------

const OA_SELECT = "id,doi,title,display_name,publication_year,authorships,primary_location,abstract_inverted_index,keywords,concepts,cited_by_count,ids,type";

async function openalex(query: string, opts: SearchOpts): Promise<DbResult> {
  const per = 200;
  const filters: string[] = [];
  if (opts.yearFrom) filters.push(`from_publication_date:${opts.yearFrom}-01-01`);
  if (opts.yearTo) filters.push(`to_publication_date:${opts.yearTo}-12-31`);
  const hits: Hit[] = [];
  let found = 0;
  for (let page = 1; hits.length < opts.limit && page <= 10; page++) {
    const want = Math.min(per, opts.limit - hits.length);
    const p = new URLSearchParams({ search: query, "per-page": String(want), page: String(page), select: OA_SELECT });
    if (filters.length) p.set("filter", filters.join(","));
    if (process.env.CONTACT_EMAIL) p.set("mailto", process.env.CONTACT_EMAIL);
    if (process.env.OPENALEX_API_KEY) p.set("api_key", process.env.OPENALEX_API_KEY);
    const j = await getJSON(endpoint("https://api.openalex.org/works?" + p.toString(), "openalex"));
    found = Number(j?.meta?.count ?? found);
    const results: any[] = Array.isArray(j?.results) ? j.results : [];
    hits.push(...results.map(mapOpenAlex).filter((h) => h.title || h.doi));
    if (results.length < want) break;
  }
  return { db: "openalex", found, hits, error: null, capped: found > hits.length };
}

export function invertedAbstract(idx: unknown): string | null {
  if (!idx || typeof idx !== "object") return null;
  const words: [number, string][] = [];
  for (const [w, positions] of Object.entries(idx as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (typeof p === "number") words.push([p, w]);
  }
  words.sort((a, b) => a[0] - b[0]);
  const text = squash(words.map((x) => x[1]).join(" "));
  return text || null;
}

export function mapOpenAlex(w: any): Hit {
  const title = tidyTitle(w?.title || w?.display_name || "");
  const authors = (Array.isArray(w?.authorships) ? w.authorships : [])
    .map((a: any) => lastFirst(a?.author?.display_name || a?.raw_author_name || "")).filter(Boolean);
  const doi = cleanDOI(w?.doi || w?.ids?.doi || "");
  const pmid = String(w?.ids?.pmid || "").replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//, "").replace(/\/$/, "");
  const keywords = uniq([
    ...(Array.isArray(w?.keywords) ? w.keywords.map((k: any) => k?.display_name || "") : []),
    ...(Array.isArray(w?.concepts) ? w.concepts.filter((c: any) => (c?.score ?? 0) >= 0.3).map((c: any) => c?.display_name || "") : []),
  ]).slice(0, 30);
  const id = String(w?.id || "").replace("https://openalex.org/", "");
  return {
    db: "openalex", external_id: id, title, abstract: invertedAbstract(w?.abstract_inverted_index), authors: authors.join("; ") || null,
    year: yearOf(w?.publication_year), journal: squash(w?.primary_location?.source?.display_name) || null, doi: doi || null, pmid: pmid || null,
    keywords, cited_by: typeof w?.cited_by_count === "number" ? w.cited_by_count : null, url: id ? `https://openalex.org/${id}` : null, type: w?.type || null,
  };
}

// ---------- ERIC ----------

const ERIC_FIELDS = "id,title,author,description,publicationdateyear,source,subject,publicationtype,peerreviewed,url";

async function eric(query: string, opts: SearchOpts): Promise<DbResult> {
  const rows = 200;
  const q = opts.yearFrom || opts.yearTo ? `(${query}) AND publicationdateyear:[${opts.yearFrom || 1900} TO ${opts.yearTo || 2200}]` : query;
  const hits: Hit[] = [];
  let found = 0;
  for (let start = 0; hits.length < opts.limit && start < 2000; ) {
    const want = Math.min(rows, opts.limit - hits.length);
    const p = new URLSearchParams({ search: q, format: "json", rows: String(want), start: String(start), fields: ERIC_FIELDS });
    const j = await getJSON(endpoint("https://api.ies.ed.gov/eric/?" + p.toString(), "eric"));
    found = Number(j?.response?.numFound ?? found);
    const docs: any[] = Array.isArray(j?.response?.docs) ? j.response.docs : [];
    hits.push(...docs.map(mapEric).filter((h) => h.title));
    if (docs.length < want) break;
    start += docs.length;
  }
  return { db: "eric", found, hits, error: null, capped: found > hits.length };
}

export function mapEric(d: any): Hit {
  const id = String(d?.id || "");
  const authors = (Array.isArray(d?.author) ? d.author : typeof d?.author === "string" ? [d.author] : []).map((a: string) => lastFirst(a)).filter(Boolean);
  const doi = extractDOI(String(d?.url || ""));
  const types = Array.isArray(d?.publicationtype) ? d.publicationtype : typeof d?.publicationtype === "string" ? [d.publicationtype] : [];
  return {
    db: "eric", external_id: id, title: tidyTitle(d?.title || ""), abstract: squash(d?.description) || null, authors: authors.join("; ") || null,
    year: yearOf(d?.publicationdateyear), journal: squash(d?.source) || null, doi: doi || null, pmid: null,
    keywords: uniq(Array.isArray(d?.subject) ? d.subject : typeof d?.subject === "string" ? [d.subject] : []).slice(0, 30),
    cited_by: null, url: id ? `https://eric.ed.gov/?id=${id}` : null, type: types.join("; ") || null,
  };
}

// ---------- Semantic Scholar ----------

const S2_FIELDS = "title,abstract,authors,year,venue,journal,externalIds,citationCount,publicationTypes";

async function semanticScholar(query: string, opts: SearchOpts): Promise<DbResult> {
  const headers: Record<string, string> = process.env.S2_API_KEY ? { "x-api-key": process.env.S2_API_KEY } : {};
  const per = 100;
  const hits: Hit[] = [];
  let found = 0;
  for (let offset = 0; hits.length < opts.limit && offset < 1000; ) {
    const want = Math.min(per, opts.limit - hits.length);
    const p = new URLSearchParams({ query, limit: String(want), offset: String(offset), fields: S2_FIELDS });
    if (opts.yearFrom || opts.yearTo) p.set("year", `${opts.yearFrom || ""}-${opts.yearTo || ""}`);
    if (offset > 0) await sleep(process.env.S2_API_KEY ? 150 : 1100);
    const j = await getJSON(endpoint("https://api.semanticscholar.org/graph/v1/paper/search?" + p.toString(), "semanticscholar"), headers);
    found = Number(j?.total ?? found);
    const data: any[] = Array.isArray(j?.data) ? j.data : [];
    hits.push(...data.map(mapS2).filter((h) => h.title));
    if (data.length < want || typeof j?.next !== "number") break;
    offset = j.next;
  }
  return { db: "semanticscholar", found, hits, error: null, capped: found > hits.length };
}

export function mapS2(d: any): Hit {
  const authors = (Array.isArray(d?.authors) ? d.authors : []).map((a: any) => lastFirst(a?.name || "")).filter(Boolean);
  const types = Array.isArray(d?.publicationTypes) ? d.publicationTypes : [];
  const doi = cleanDOI(d?.externalIds?.DOI || "");
  const pmid = String(d?.externalIds?.PubMed || "");
  const id = String(d?.paperId || "");
  return {
    db: "semanticscholar", external_id: id, title: tidyTitle(d?.title || ""), abstract: squash(d?.abstract) || null, authors: authors.join("; ") || null,
    year: yearOf(d?.year), journal: squash(d?.journal?.name || d?.venue) || null, doi: doi || null, pmid: pmid || null, keywords: [],
    cited_by: typeof d?.citationCount === "number" ? d.citationCount : null, url: id ? `https://www.semanticscholar.org/paper/${id}` : null, type: types.join("; ") || null,
  };
}
