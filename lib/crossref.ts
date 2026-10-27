// Server-side Crossref lookups (no key needed).

export type CrossrefHit = {
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  doi: string;
  abstract: string;
};

const UA = "CHHSRMetaAnalysisPortal/1.0 (mailto:research@example.org)";

function mapItem(it: any): CrossrefHit {
  const authors = Array.isArray(it.author)
    ? it.author.map((a: any) => [a.family, a.given].filter(Boolean).join(", ")).join("; ")
    : "";
  const dateParts = it.issued?.["date-parts"]?.[0] || it.published?.["date-parts"]?.[0] || [];
  const year = dateParts[0] ? Number(dateParts[0]) : null;
  const abstract = typeof it.abstract === "string" ? it.abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  return {
    title: (it.title && it.title[0]) || "",
    authors,
    year: Number.isFinite(year as number) ? year : null,
    journal: (it["container-title"] && it["container-title"][0]) || "",
    doi: (it.DOI || "").toLowerCase(),
    abstract,
  };
}

export async function lookupDOI(doi: string): Promise<CrossrefHit | null> {
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.message ? mapItem(json.message) : null;
  } catch {
    return null;
  }
}

export async function searchCrossref(q: string): Promise<CrossrefHit[]> {
  try {
    const url = `https://api.crossref.org/works?rows=6&query.bibliographic=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.message?.items || []).map(mapItem);
  } catch {
    return [];
  }
}
