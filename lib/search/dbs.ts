// The databases step 1 can search, and the ones it cannot. Safe to import from the browser.

export type Db = "pubmed" | "openalex" | "eric" | "semanticscholar";

export type DbInfo = { id: Db; label: string; note: string; open: (q: string) => string };

export const DBS: DbInfo[] = [
  {
    id: "pubmed", label: "PubMed",
    note: "Medicine and health, including school mental health trials. Takes PubMed's own syntax: AND, OR, NOT, quotes, and tags such as [tiab].",
    open: (q) => `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}`,
  },
  {
    id: "openalex", label: "OpenAlex",
    note: "250 million works across every field, the closest free equivalent to Google Scholar's coverage. Takes AND, OR, NOT and quotes.",
    open: (q) => `https://openalex.org/works?filter=default.search:${encodeURIComponent(q)}`,
  },
  {
    id: "eric", label: "ERIC",
    note: "Education research: journal articles, reports and dissertations on school programs. Takes AND, OR, NOT and quotes.",
    open: (q) => `https://eric.ed.gov/?q=${encodeURIComponent(q)}`,
  },
  {
    id: "semanticscholar", label: "Semantic Scholar",
    note: "Broad coverage with citation counts. Plain keywords work best. It limits anonymous use, so it sometimes asks you to try again in a minute.",
    open: (q) => `https://www.semanticscholar.org/search?q=${encodeURIComponent(q)}`,
  },
];

export const DB_LABEL: Record<string, string> = Object.fromEntries(DBS.map((d) => [d.id, d.label]));

// Places the app cannot search for you, offered as links that open the same query there.
export function isDb(v: unknown): v is Db {
  return typeof v === "string" && DBS.some((d) => d.id === v);
}

export const OUTSIDE: { label: string; open: (q: string) => string; note: string }[] = [
  { label: "Google Scholar", open: (q) => `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`, note: "no API; export with Publish or Perish, or add papers by DOI" },
];
