import Link from "next/link";
import Help from "@/components/Help";
import SearchPanel from "@/components/SearchPanel";
import ScreenTable from "@/components/ScreenTable";
import AiScreen from "@/components/AiScreen";
import AddPapersModal from "@/components/AddPapersModal";
import { logout, loadScreenCriteria, loadKeywordIdeas } from "@/lib/actions";
import { requireMember, allMembers } from "@/lib/session";
import { loadCandidates, abstractsFor, toRow, type Cand } from "@/lib/candidates";
import { SCREEN_RULE } from "@/lib/screening";
import { DBS, DB_LABEL } from "@/lib/search/dbs";
import { aiConfigured } from "@/lib/claude";
import { plural, when } from "@/lib/format";

export const dynamic = "force-dynamic";
// A search asks up to four databases and reads hundreds of records; allow five minutes.
export const maxDuration = 300;

const FILTERS: { key: string; label: string }[] = [
  { key: "mine", label: "Waiting for me" },
  { key: "pending", label: "Not screened by anyone" },
  { key: "unsure", label: "Marked Unsure" },
  { key: "split", label: "Needs a decision" },
  { key: "out", label: "Screened out" },
  { key: "all", label: "Everything still in the search list" },
];

const AI_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Any AI hint" },
  { key: "likely", label: "AI: likely" },
  { key: "unclear", label: "AI: unclear" },
  { key: "unlikely", label: "AI: unlikely" },
  { key: "none", label: "No AI hint yet" },
];

const SORTS: { key: string; label: string }[] = [
  { key: "new", label: "Newest found first" },
  { key: "old", label: "Oldest found first" },
  { key: "ai", label: "AI: likely first" },
  { key: "year", label: "Year, newest first" },
  { key: "cited", label: "Most cited first" },
  { key: "title", label: "Title A to Z" },
];

const PAGE = 100;

type Params = { st?: string; q?: string; db?: string; k?: string; ai?: string; sort?: string; page?: string; add?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireMember();
  const members = await allMembers();
  const { st = "mine", q = "", db = "", k = "", ai = "", sort = "new", page = "1", add } = await searchParams;
  const list = await loadCandidates(me.id);
  const criteria = list.ready ? await loadScreenCriteria() : "";
  const ideas = list.ready ? await loadKeywordIdeas() : { ideas: [], error: null };

  const qq = q.trim().toLowerCase();
  let cands = list.cands.filter((x) => {
    const s = x.st.status;
    if (st === "mine" && !x.mine) return false;
    if (st === "pending" && (s !== "pending" || x.marks.length > 0)) return false;
    if (st === "unsure" && !(s === "pending" && x.marks.some((m) => m.decision === "unsure"))) return false;
    if (st === "split" && s !== "split") return false;
    if (st === "out" && s !== "out") return false;
    const fb = Array.isArray(x.c.found_by) ? x.c.found_by : [];
    if (db && !fb.some((f) => f.db === db)) return false;
    if (k && !fb.some((f) => f.q === k)) return false;
    const v = x.c.ai_screen?.verdict;
    if (ai === "none" && v) return false;
    if (ai && ai !== "none" && v !== ai) return false;
    if (qq) {
      const c = x.c;
      const hay = `${c.title || ""} ${c.authors || ""} ${c.year || ""} ${c.doi || ""} ${c.journal || ""} ${(c.keywords || []).join(" ")}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
  const aiRank = (x: Cand) => (x.c.ai_screen?.verdict === "likely" ? 0 : x.c.ai_screen?.verdict === "unclear" ? 1 : x.c.ai_screen?.verdict === "unlikely" ? 3 : 2);
  if (sort === "old") cands = [...cands].reverse();
  else if (sort === "ai") cands = [...cands].sort((a, b) => aiRank(a) - aiRank(b));
  else if (sort === "year") cands = [...cands].sort((a, b) => (b.c.year || 0) - (a.c.year || 0));
  else if (sort === "cited") cands = [...cands].sort((a, b) => (b.c.cited_by || 0) - (a.c.cited_by || 0));
  else if (sort === "title") cands = [...cands].sort((a, b) => (a.c.title || "").localeCompare(b.c.title || ""));

  const pageNo = Math.max(1, parseInt(page, 10) || 1);
  const pages = Math.max(1, Math.ceil(cands.length / PAGE));
  const shown = cands.slice((pageNo - 1) * PAGE, pageNo * PAGE);
  const abstracts = await abstractsFor(shown.map((x) => x.c.id));
  const rows = shown.map((x) => toRow(x, abstracts.get(x.c.id) ?? null));

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    const vals: Record<string, string> = { st, q, db, k, ai, sort, page: "", ...extra };
    for (const [key, v] of Object.entries(vals)) if (v && !(key === "st" && v === "mine") && !(key === "sort" && v === "new") && !(key === "page" && v === "1")) p.set(key, v);
    const str = p.toString();
    return "/search" + (str ? "?" + str : "");
  };

  // Queries that were run, with how many candidates each still has in the list.
  const queries = Array.from(new Set(list.searches.map((s) => s.query)));
  const pulledTotal = list.searches.reduce((n, s) => n + (s.pulled || 0), 0);
  const addedTotal = list.searches.reduce((n, s) => n + (s.added || 0), 0);
  const c = list.counts;

  return (
    <main className="center wide list">
      <div className="listhead">
        <div>
          <Link href="/" className="btn primary homebtn"><span aria-hidden="true">&larr;</span> All papers</Link>
        </div>
        <h1 className="brand">Step 1: find and screen papers</h1>
        <AddPapersModal openByDefault={add === "1"} stage="search" />
      </div>

      {!list.ready && (
        <div className="err" style={{ fontSize: 18 }}>
          The database has not been updated for this version yet ({list.error}). Run <span className="mono">supabase/migrate_v4.sql</span> in the Supabase SQL editor (SQL Editor, New query, paste, Run).
        </div>
      )}

      <SearchPanel bank={list.bank} terms={list.terms} ideas={ideas.ideas} ideasError={ideas.error} members={members} me={me} />

      <div className="nextbar live">
        <span className="eyebrow">Your next step</span>
        <span className="txt">
          {c.total === 0
            ? <>The search list is empty. Run a search above, or add papers you already know with the button on the right.</>
            : c.mine > 0
              ? <><b>{plural(c.mine, "candidate waits", "candidates wait")} for your screening.</b> Read the title and abstract, then mark Relevant or Not relevant. One Relevant moves a paper to the master list.</>
              : <><b>You have looked at every candidate.</b> {c.split > 0 ? `${plural(c.split, "candidate")} need a team decision (filter: Needs a decision).` : c.pending > 0 ? `${plural(c.pending, "candidate")} still wait for someone else.` : "Nothing is waiting."}</>}
        </span>
        {c.mine > 0 && <Link className="btn primary" href="/search/screen">Screen one by one &rarr;</Link>}
      </div>

      <p className="summary">
        <b>{plural(c.total, "candidate")}</b> in the search list
        {c.total > 0 && (
          <>
            {" "}&middot; <Link href={keep({ st: "pending" })}>{c.pending} not screened yet</Link>
            {c.split > 0 && <> &middot; <Link href={keep({ st: "split" })}>{c.split} need a decision</Link></>}
            {" "}&middot; <Link href={keep({ st: "out" })}>{c.out} screened out</Link>
            {" "}&middot; <Link href="/">{list.movedFromSearch} moved to the master list</Link>
          </>
        )}
        <Help text={SCREEN_RULE + " Screened-out candidates stay here, under the Screened out filter, so the PRISMA counts can be rebuilt."} />
      </p>

      {list.ready && (
        <AiScreen criteria={criteria} left={c.ai.none} done={c.ai.likely + c.ai.unlikely + c.ai.unclear} aiReady={aiConfigured()} />
      )}

      <form method="get" className="toolbar">
        <input type="search" name="q" defaultValue={q} placeholder="Search the list by title, author, journal, keyword" />
        <select name="st" defaultValue={st} aria-label="Status">
          {FILTERS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        {queries.length > 0 && (
          <select name="k" defaultValue={k} aria-label="Found by which search">
            <option value="">Any search</option>
            {queries.map((x) => <option key={x} value={x}>{x.length > 60 ? x.slice(0, 57) + "..." : x}</option>)}
          </select>
        )}
        <select name="db" defaultValue={db} aria-label="Database">
          <option value="">Any database</option>
          {DBS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select name="ai" defaultValue={ai} aria-label="AI hint">
          {AI_FILTERS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort">
          {SORTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <button type="submit" className="primary">Show</button>
        {(q || st !== "mine" || db || k || ai || sort !== "new") && <Link href="/search" className="muted">Clear</Link>}
      </form>

      {cands.length !== c.total && <p className="muted" style={{ margin: "0 0 6px" }}>{plural(cands.length, "candidate")} match{cands.length === 1 ? "es" : ""}.</p>}
      {list.ready && (
        <ScreenTable rows={rows} members={members} me={me} pi={Boolean(me.is_pi)}
          empty={<p className="muted mt">
            {c.total === 0 ? "No candidates yet." : st === "mine" ? "Nothing is waiting for you. " : "No candidates match. "}
            {c.total > 0 && st === "mine" && <Link href={keep({ st: "all" })}>Show everything still in the search list</Link>}
          </p>} />
      )}
      {pages > 1 && (
        <p className="muted mt">
          Page {pageNo} of {pages}.{" "}
          {pageNo > 1 && <Link href={keep({ page: String(pageNo - 1) })}>&larr; Previous</Link>}{" "}
          {pageNo < pages && <Link href={keep({ page: String(pageNo + 1) })}>Next &rarr;</Link>}
        </p>
      )}

      <details className="fold mt">
        <summary>Search log and PRISMA counts ({plural(list.searches.length, "search", "searches")})</summary>
        <p className="muted">Every search that was run, for the methods section and the PRISMA flow diagram. The same table is in the Excel download as the Search log sheet.</p>
        <table className="grid">
          <thead><tr><th>When</th><th>Who</th><th>Query</th><th>Databases</th><th>Years</th><th>Pulled</th><th>New</th></tr></thead>
          <tbody>
            {list.searches.map((s) => (
              <tr key={s.id}>
                <td className="nowrap">{when(s.run_at)}</td>
                <td className="nowrap">{members.find((m) => m.id === s.run_by)?.name || "someone"}</td>
                <td><Link href={keep({ k: s.query, st: "all" })}>{s.query}</Link></td>
                <td>
                  {(s.dbs || []).map((d) => {
                    const r = s.results?.[d];
                    return <div key={d} className="tiny">{DB_LABEL[d] || d}: {r ? (r.error ? <span className="bad">failed: {r.error}</span> : <>{r.found.toLocaleString()} found, {r.pulled} pulled, {r.added} new</>) : "-"}</div>;
                  })}
                </td>
                <td className="nowrap">{s.year_from || s.year_to ? `${s.year_from || ""} to ${s.year_to || ""}` : "any"}</td>
                <td>{s.pulled}</td>
                <td>{s.added}</td>
              </tr>
            ))}
            {list.searches.length === 0 && <tr><td colSpan={7} className="muted">No searches run yet.</td></tr>}
          </tbody>
        </table>
        <table className="grid mt prisma">
          <tbody>
            <tr><th>Records identified from database searches (before removing duplicates)</th><td>{pulledTotal}</td></tr>
            <tr><th>Duplicates removed (same paper from several databases or searches)</th><td>{Math.max(0, pulledTotal - addedTotal)}</td></tr>
            <tr><th>Records added by hand to the search list (imports, DOIs, PDFs)</th><td>{c.byHand}</td></tr>
            <tr><th>Records screened out at title and abstract</th><td>{c.out}</td></tr>
            <tr><th>Records still to screen</th><td>{c.pending + c.split}</td></tr>
            <tr><th>Records moved to the master list for full-text review</th><td>{list.movedFromSearch}</td></tr>
            <tr><th>Papers in the master list in all (including those added there directly)</th><td>{list.masterTotal}</td></tr>
          </tbody>
        </table>
      </details>

      <div className="foot">
        <Link href="/guide#search">How to search well (guide)</Link>
        <Link href="/">All papers</Link>
        <div className="mt">
          Signed in as <b>{me.name}</b> &middot;{" "}
          <form action={logout}>
            <button type="submit" className="link">Switch user</button>
          </form>
        </div>
      </div>
    </main>
  );
}
