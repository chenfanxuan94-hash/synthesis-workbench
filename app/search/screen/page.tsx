import Link from "next/link";
import ScreenOne from "@/components/ScreenOne";
import { requireMember, allMembers } from "@/lib/session";
import { loadCandidates, abstractsFor, toRow, pickCandidate } from "@/lib/candidates";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

// One candidate at a time. Without ?id=, the oldest candidate still waiting for this person.
export default async function ScreenPage({ searchParams }: { searchParams: Promise<{ id?: string; after?: string; did?: string }> }) {
  const me = await requireMember();
  const members = await allMembers();
  const { id, after, did } = await searchParams;
  const list = await loadCandidates(me.id);
  if (!list.ready) {
    return (
      <main className="center">
        <div className="err">The database has not been updated for this version yet ({list.error}). Run <span className="mono">supabase/migrate_v4.sql</span> in the Supabase SQL editor.</div>
        <p><Link href="/search">Back to the search list</Link></p>
      </main>
    );
  }
  const pick = pickCandidate(list, me.id, id, after);
  if (!pick.cand) {
    const c = list.counts;
    return (
      <main className="center">
        {did === "moved" && <div className="note good">Previous candidate: Relevant, moved to the master list.</div>}
        <div className="allclear">
          <b>{id ? "That candidate is no longer in the search list." : "Nothing is left for you in step 1."}</b>{" "}
          {c.split > 0 && `${plural(c.split, "candidate")} ${c.split === 1 ? "needs" : "need"} a team decision. `}
          {c.pending > 0 && `${plural(c.pending, "candidate")} still wait for someone else. `}
          {c.total === 0 && "The search list is empty: run a search or add papers. "}
          <Link href="/search">Back to the search list</Link>
          {id && <> &middot; <Link href={`/papers/${id}`}>Open it in the master list</Link></>}
        </div>
      </main>
    );
  }
  const abstracts = await abstractsFor([pick.cand.c.id]);
  const row = toRow(pick.cand, abstracts.get(pick.cand.c.id) ?? null);
  return (
    <main className="center">
      <ScreenOne key={row.id} r={row} members={members} me={me} left={pick.left} nextId={pick.nextId} did={did} />
    </main>
  );
}
