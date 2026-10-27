import Link from "next/link";
import { cookies } from "next/headers";
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
  const jar = await cookies();
  const guideRead = jar.get("wb_guide_" + me.id)?.value === "1";
  const votedAny = lib.rows.some((r) => r.votes.some((v) => v.member_id === me.id));
  const needsGuide = !guideRead && !votedAny;
  const toVote = lib.mine.vote.length;
  const toCode = lib.mine.code.length;
  const splitForMe = Boolean(me.is_pi) && lib.split > 0;

  let current = -1;
  if (!lib.ready) current = -2;
  else if (needsGuide) current = 0;
  else if (lib.total === 0) current = 1;
  else if (toVote > 0 || splitForMe) current = 2;
  else if (toCode > 0) current = 3;
  const splitMode = current === 2 && toVote === 0 && splitForMe;

  function nowLine(n: number): string {
    if (n === 0) return "Everyone starts here, once.";
    if (n === 1) return "The library is empty. Add the first papers.";
    if (n === 2) return splitMode ? `${plural(lib.split, "paper is", "papers are")} waiting for your decision.` : `${plural(toVote, "paper needs", "papers need")} your vote.`;
    if (n === 3) return `${plural(toCode, "approved paper is", "approved papers are")} not done yet.`;
    return "";
  }

  function rightSide(n: number) {
    if (n === 0) return needsGuide ? <b>Start here</b> : null;
    if (n === 1) return lib.total > 0 ? <>{lib.total} in the library</> : null;
    if (n === 2) {
      if (toVote > 0) return <b>{toVote} need your vote</b>;
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
    <main className="center">
      <h1 className="brand-title">CHHSR Meta Analysis Portal</h1>
      <p className="hello">Hello, {me.name}. {current >= 0 ? "Here is what to do next." : ""}</p>

      {!lib.ready && (
        <div className="err" style={{ fontSize: 18 }}>
          The database has not been updated for this version yet ({lib.error}).
          Fan: run <span className="mono">supabase/migrate_v3.sql</span> in the Supabase SQL editor, then reload this page.
        </div>
      )}

      {current === -1 && (
        <div className="allclear">
          <b>Nothing needs you right now.</b>
          {lib.waitingOthers > 0 && <> {plural(lib.waitingOthers, "paper")} you voted on {lib.waitingOthers === 1 ? "is" : "are"} waiting for a second vote from someone else.</>}
          {lib.split > 0 && !me.is_pi && <> {plural(lib.split, "paper")} {lib.split === 1 ? "is" : "are"} waiting for Fan&apos;s decision.</>}
          {lib.waitingOthers === 0 && lib.split === 0 && <> Papers show up here as your teammates add them and vote.</>}
        </div>
      )}

      <ol className="flow">
        {STEPS.map((s) => {
          const isNow = s.n === current;
          const waiting = (s.n === 2 && (toVote > 0 || splitForMe)) || (s.n === 3 && toCode > 0) || (s.n === 0 && needsGuide);
          const title = isNow && splitMode ? "Decide the split papers" : s.title;
          const what = isNow && splitMode ? "Some papers got both an Include and an Exclude vote. Open each one, read the notes, and record your decision in Edit details." : s.what;
          const href = isNow && splitMode ? "/papers?f=split" : s.href;
          const go = isNow && splitMode ? "Open the split papers" : s.go;
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
        <div className="mt">
          Signed in as <b>{me.name}</b>{me.is_pi ? " (PI)" : ""} &middot;{" "}
          <form action={logout}>
            <button type="submit" className="link">Switch user</button>
          </form>
        </div>
      </div>
    </main>
  );
}
