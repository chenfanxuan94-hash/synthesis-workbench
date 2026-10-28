import Link from "next/link";
import Help from "@/components/Help";
import VoteChips from "@/components/VoteChips";
import AddPapersModal from "@/components/AddPapersModal";
import NextStep from "@/components/NextStep";
import { RowDelete, DeleteSelectedButton, SelectAll, BULK_FORM } from "@/components/DeleteControls";
import { deleteSelected, logout } from "@/lib/actions";
import { requireMember, allMembers } from "@/lib/session";
import { loadLibrary, type Row } from "@/lib/library";
import { STATUS_LABEL, RULE, explain } from "@/lib/status";
import { VOTES_REQUIRED } from "@/lib/config";
import { ago, plural } from "@/lib/format";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All papers" },
  { key: "mine", label: "Need my vote" },
  { key: "needs_votes", label: "Need votes" },
  { key: "split", label: "Needs a decision" },
  { key: "approved", label: "Approved" },
  { key: "todo", label: "Approved, coding not done" },
  { key: "done", label: "Coding done" },
  { key: "rejected", label: "Rejected" },
  { key: "nopdf", label: "No PDF yet" },
];

const SORTS: { key: string; label: string }[] = [
  { key: "new", label: "Newest first" },
  { key: "active", label: "Recently worked on" },
  { key: "title", label: "Title A to Z" },
];

const PAGE = 150;

export default async function PapersPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; s?: string; sort?: string; all?: string; add?: string }> }) {
  const me = await requireMember();
  const members = await allMembers();
  const { f = "all", q = "", s = "", sort = "new", all, add } = await searchParams;
  const lib = await loadLibrary(me.id);
  const blind = process.env.BLIND_VOTES === "1";
  const nameOf = (id: string | null | undefined) => members.find((m) => m.id === id)?.name || "";

  const qq = q.trim().toLowerCase();
  let rows = lib.rows.filter((r) => {
    const st = r.standing.status;
    if (f === "mine" && !r.needsMe) return false;
    if (f === "needs_votes" && st !== "needs_votes") return false;
    if (f === "split" && st !== "split") return false;
    if (f === "approved" && st !== "approved") return false;
    if (f === "rejected" && st !== "rejected") return false;
    if (f === "todo" && (st !== "approved" || r.coding?.done)) return false;
    if (f === "done" && !r.coding?.done) return false;
    if (f === "nopdf" && r.paper.pdf_path) return false;
    if (s && (r.paper.source || "") !== s) return false;
    if (qq) {
      const p = r.paper;
      const hay = `${p.title || ""} ${p.authors || ""} ${p.year || ""} ${p.doi || ""} ${p.journal || ""}`.toLowerCase();
      if (!hay.includes(qq)) return false;
    }
    return true;
  });
  if (sort === "active") rows = [...rows].sort((a, b) => ((b.last?.at || b.paper.created_at) > (a.last?.at || a.paper.created_at) ? 1 : -1));
  else if (sort === "title") rows = [...rows].sort((a, b) => (a.paper.title || "").localeCompare(b.paper.title || ""));
  const shown = all === "1" ? rows : rows.slice(0, PAGE);

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    const vals: Record<string, string> = { f, q, s, sort, all: all || "", ...extra };
    for (const [k, v] of Object.entries(vals)) if (v && !(k === "f" && v === "all") && !(k === "sort" && v === "new")) p.set(k, v);
    const str = p.toString();
    return "/" + (str ? "?" + str : "");
  };

  return (
    <main className="center wide list">
      <div className="listhead">
        <h1 className="brand">CHHSR Meta Analysis Portal</h1>
        <div className="row" style={{ alignItems: "center", flexWrap: "nowrap" }}>
          <Link href="/search" className={"btn big searchbtn" + (lib.ready && lib.screening.mine > 0 ? " primary" : "")}>
            Search &amp; screen{lib.ready && lib.screening.mine > 0 ? ` (${lib.screening.mine} for you)` : lib.ready && lib.screening.total > 0 ? ` (${lib.screening.total})` : ""}
          </Link>
          <AddPapersModal openByDefault={add === "1"} />
        </div>
      </div>

      <NextStep lib={lib} />

      {!lib.ready && (
        <div className="err" style={{ fontSize: 18 }}>
          The database has not been updated for this version yet ({lib.error}). Run <span className="mono">supabase/migrate_v4.sql</span> in the Supabase SQL editor (SQL Editor, New query, paste, Run). Coming from a version before 3, run <span className="mono">migrate_v3.sql</span> first.
        </div>
      )}

      <p className="summary">
        <b>{plural(lib.total, "paper")}</b> in the master list
        {lib.total > 0 && (
          <>
            {" "}&middot; <Link href={keep({ f: "approved" })}>{lib.counts.approved} approved</Link>
            {" "}&middot; <Link href={keep({ f: "rejected" })}>{lib.counts.rejected} rejected</Link>
            {" "}&middot; <Link href={keep({ f: "needs_votes" })}>{lib.counts.needs_votes} need votes</Link>
            {lib.counts.split > 0 && <> &middot; <Link href={keep({ f: "split" })}>{lib.counts.split} need a decision</Link></>}
            {lib.mine.vote.length > 0 && <> &middot; <Link href={keep({ f: "mine" })}><b>{lib.mine.vote.length} need your vote</b></Link></>}
          </>
        )}
        <Help text={RULE + " Votes: green = Include, red = Exclude, yellow = Not sure, grey = has not voted yet. Hover a chip for the name and the reason."} />
      </p>

      <form method="get" className="toolbar">
        <input type="search" name="q" defaultValue={q} placeholder="Search by title, author, journal, or DOI" />
        <select name="f" defaultValue={f} aria-label="Status">
          {FILTERS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        {lib.sources.length > 0 && (
          <select name="s" defaultValue={s} aria-label="Source">
            <option value="">Any source</option>
            {lib.sources.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
        <select name="sort" defaultValue={sort} aria-label="Sort">
          {SORTS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        <button type="submit" className="primary">Show</button>
        {(q || f !== "all" || s || sort !== "new") && <Link href="/" className="muted">Clear</Link>}
      </form>

      <div className="listline">
        {rows.length !== lib.total ? <span className="muted">{plural(rows.length, "paper")} match{rows.length === 1 ? "es" : ""}.</span> : <span />}
        {me.is_pi && rows.length > 0 && (
          <span className="muted">Tick papers to remove them, then <DeleteSelectedButton /><Help text="Deletes the ticked papers with their PDF, votes, coding, and effect rows. For test uploads and duplicates. Anyone can also delete a single paper from its Edit details tab." /></span>
        )}
      </div>

      <form action={deleteSelected} id={BULK_FORM}>
        <input type="hidden" name="back" value={keep({})} />
        <table className="grid master">
          <thead>
            <tr>
              {me.is_pi && <th className="tick"><SelectAll /></th>}
              <th>Paper</th>
              <th>Votes</th>
              <th>Status</th>
              <th>Coding<Help text="Study features and effect sizes, entered on one shared form that anyone can edit. Done means the team marked the paper finished." /></th>
              <th>Last worked on</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => <PaperRow key={r.paper.id} r={r} members={members} meId={me.id} blind={blind} nameOf={nameOf} pi={Boolean(me.is_pi)} />)}
          </tbody>
        </table>
      </form>
      {rows.length === 0 && <p className="muted mt">No papers match.</p>}
      {shown.length < rows.length && (
        <p className="muted mt">Showing the first {PAGE} of {rows.length}. <Link href={keep({ all: "1" })}>Show all {rows.length}</Link></p>
      )}

      <div className="foot">
        <Link href="/guide">Read the guide</Link>
        <Link href="/dataset">Download the dataset</Link>
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

function PaperRow({ r, members, meId, blind, nameOf, pi }: { r: Row; members: any[]; meId: string; blind: boolean; nameOf: (id: string | null | undefined) => string; pi: boolean }) {
  const p = r.paper;
  const s = r.standing;
  const names = r.votes.map((v) => `${nameOf(v.member_id)} ${v.decision === "include" ? "Include" : v.decision === "exclude" ? "Exclude" : "Not sure"}`);
  const statusText = s.byPI ? (s.status === "approved" ? "Approved by decision" : "Rejected by decision")
    : s.status === "needs_votes" ? `Needs votes ${s.include + s.exclude}/${VOTES_REQUIRED}` : STATUS_LABEL[s.status];
  const authors = p.authors ? p.authors.split(";").slice(0, 3).join(";") + (p.authors.split(";").length > 3 ? "; et al." : "") : "";
  const coding = s.status !== "approved" && !r.coding && r.effects === 0
    ? <span className="muted">-</span>
    : r.coding?.done
      ? <span className="pill done">done{r.effects ? ` - ${plural(r.effects, "row")}` : ""}</span>
      : r.coding || r.effects
        ? <span className="pill working">in progress{r.effects ? ` - ${plural(r.effects, "row")}` : ""}</span>
        : <span className="muted">not started</span>;
  const href = (tab: string) => `/papers/${p.id}?tab=${tab}`;
  return (
    <tr className={r.needsMe ? "needsme" : ""}>
      {pi && <td className="tick"><input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.title || "untitled"}`} /></td>}
      <td className="paper">
        <Link href={href("overview")} className="paperlink">{p.title || "(untitled)"}</Link>
        <div className="sub">{[authors, p.journal, p.year].filter(Boolean).join(" - ")}</div>
        <div className="sub tiny">{p.source || "no source"}{p.screened_in_at ? " (screened in)" : ""} &middot; {p.pdf_path ? "PDF attached" : "no PDF"}</div>
      </td>
      <td className="nowrap"><VoteChips members={members} votes={r.votes} meId={meId} blind={blind} /></td>
      <td className="nowrap"><span className={"pill " + s.status} title={explain(s, names)}>{statusText}</span></td>
      <td className="nowrap">{coding}</td>
      <td className="lastcol">
        {r.last ? <><b>{nameOf(r.last.member_id) || "someone"}</b> {r.last.what}<div className="sub">{ago(r.last.at)}</div></> : <span className="muted">-</span>}
      </td>
      <td className="actions">
        {r.needsMe && <Link className="btn small primary" href={href("vote")}>Vote</Link>}
        <Link className="btn small" href={href("overview")}>View</Link>
        <Link className="btn small" href={href("edit")}>Edit</Link>
        <Link className="btn small" href={href("code")}>Code</Link>
        {pi && <RowDelete id={p.id} title={p.title || "untitled"} />}
      </td>
    </tr>
  );
}
