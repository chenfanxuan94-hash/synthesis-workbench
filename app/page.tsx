import Link from "next/link";
import Help from "@/components/Help";
import { logout } from "@/lib/actions";
import { requireMember } from "@/lib/session";
import { loadLibrary } from "@/lib/library";
import { STEPS } from "@/lib/steps";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

// Home: the whole workflow in one centered column. The big colored card is always the next
// thing to do; every other step is a quiet row.
export default async function Home() {
  const me = await requireMember();
  const lib = await loadLibrary(me.id);
  const toVote = lib.mine.vote.length;
  const toCode = lib.mine.code.length;

  let current = -1;
  if (!lib.ready) current = -2;
  else if (lib.total === 0) current = 1;
  else if (toVote > 0 || lib.split > 0) current = 2;
  else if (toCode > 0) current = 3;
  // Nothing left to vote on, but some papers got both Include and Exclude votes.
  const settleMode = current === 2 && toVote === 0 && lib.split > 0;

  function nowLine(n: number): string {
    if (n === 1) return "The library is empty. Add the first papers.";
    if (n === 2) return settleMode ? `${plural(lib.split, "paper needs", "papers need")} a team decision.` : `${plural(toVote, "paper needs", "papers need")} your vote.`;
    if (n === 3) return `${plural(toCode, "approved paper is", "approved papers are")} not done yet.`;
    return "";
  }

  function rightSide(n: number) {
    if (n === 1) return lib.total > 0 ? <>{lib.total} in the library</> : null;
    if (n === 2) {
      if (toVote > 0) return <b>{toVote} need your vote</b>;
      if (lib.split > 0) return <b>{lib.split} need a decision</b>;
      if (lib.waitingOthers > 0) return <>{lib.waitingOthers} waiting for others</>;
      return null;
    }
    if (n === 3) {
      if (toCode > 0) return <b>{toCode} to code</b>;
      if (lib.counts.approved > 0) return <>{lib.counts.approved} approved, all done</>;
      return null;
    }
    if (n === 4) return lib.effects > 0 ? <>{plural(lib.effects, "row")}</> : null;
    return null;
  }

  return (
    <main className="center home">
      <h1 className="brand-title">CHHSR Meta Analysis Portal</h1>

      {!lib.ready && (
        <div className="err" style={{ fontSize: 18 }}>
          The database has not been updated for this version yet ({lib.error}).
          Run <span className="mono">supabase/migrate_v3.sql</span> in the Supabase SQL editor, then reload this page.
        </div>
      )}

      {current === -1 && (
        <div className="allclear">
          <b>Nothing needs you right now.</b>
          {lib.waitingOthers > 0 && <> {plural(lib.waitingOthers, "paper")} you voted on {lib.waitingOthers === 1 ? "is" : "are"} waiting for a second vote from someone else.</>}
          {lib.waitingOthers === 0 && <> Papers show up here as your teammates add them and vote.</>}
        </div>
      )}

      <ol className="flow">
        {STEPS.map((s) => {
          const isNow = s.n === current;
          const waiting = (s.n === 2 && (toVote > 0 || lib.split > 0)) || (s.n === 3 && toCode > 0);
          const title = isNow && settleMode ? "Settle the split papers" : s.title;
          const what = isNow && settleMode ? "Some papers got both an Include and an Exclude vote. Talk them through as a team, then record the decision on each paper's Edit details tab." : s.what;
          const href = isNow && settleMode ? "/papers?f=split" : s.href;
          const go = isNow && settleMode ? "Open the split papers" : s.go;
          return (
            <li key={s.n} className={isNow ? "current" : waiting ? "waiting" : "idle"}>
              <span className="num">{s.n}</span>
              {isNow ? (
                <div className="card-now">
                  <div className="eyebrow">Your next step</div>
                  <div className="t">{title}</div>
                  <p>{what}</p>
                  <div className="count">{nowLine(s.n)}</div>
                  <Link className="btn" href={href}>{go} &rarr;</Link>
                </div>
              ) : (
                <div className="what">
                  <span className="t">
                    {s.title}
                    <Help text={`${s.what} (${s.who}.)`} />
                  </span>
                  <span className="st">{rightSide(s.n)}</span>
                  <Link className="btn" href={s.href}>Open</Link>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="foot">
        <Link href="/papers">All papers</Link>
        <Link href="/papers/new">Add papers</Link>
        <Link href="/guide">Read the guide</Link>
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
