import Link from "next/link";
import { cookies } from "next/headers";
import Help from "@/components/Help";
import { logout } from "@/lib/actions";
import { db } from "@/lib/supabase";
import { requireMember } from "@/lib/session";
import { loadQueues } from "@/lib/queue";
import { STEPS, TASK_ORDER, TASK_STEP } from "@/lib/steps";

export const dynamic = "force-dynamic";

// Home: the whole workflow in one centered column. The big colored card is always the next
// thing to do; every other step is a quiet row.
export default async function Home() {
  const me = await requireMember();
  const q = await loadQueues(me.id);
  const { data: mine } = await db().from("screenings").select("id").eq("member_id", me.id);
  const jar = await cookies();
  const guideRead = jar.get("wb_guide_" + me.id)?.value === "1";
  const needsGuide = !guideRead && (mine || []).length === 0;
  const conflicts = q.counts.abstract_conflict + q.counts.fulltext_conflict;

  const waiting = (n: number): number => {
    if (n === 4) return conflicts;
    const t = STEPS[n].task;
    return t ? q.mine[t].length : 0;
  };

  let current = -1;
  if (needsGuide) current = 0;
  else if (q.total === 0) current = 1;
  else {
    const t = TASK_ORDER.find((k) => q.mine[k].length > 0);
    if (t) current = TASK_STEP[t].n;
    else if (conflicts > 0) current = 4;
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  function nowLine(n: number): string {
    if (n === 0) return "Everyone starts here, once.";
    if (n === 1) return "The library is empty. Add the first papers.";
    if (n === 4) return `${plural(conflicts, "paper needs", "papers need")} the two screeners to agree.`;
    return `${plural(waiting(n), "paper is", "papers are")} waiting for you.`;
  }

  function rightSide(n: number) {
    if (n === 0) return needsGuide ? <b>Start here</b> : null;
    if (n === 1) return q.total > 0 ? <>{q.total} in the library</> : null;
    if (n === 8) return q.effects > 0 ? <>{q.effects} {q.effects === 1 ? "row" : "rows"}</> : null;
    const w = waiting(n);
    if (w === 0) return null;
    return <b>{n === 4 ? `${w} to discuss` : `${w} waiting`}</b>;
  }

  return (
    <main className="center">
      <h1 className="brand-title">CHHSR Meta Analysis Portal</h1>
      <p className="hello">Hello, {me.name}. {current >= 0 ? "Here is what to do next." : ""}</p>

      {current === -1 && (
        <div className="allclear">
          <b>You are all caught up.</b> Nothing is waiting for you right now. Papers show up here as your teammates finish their steps.
        </div>
      )}

      <ol className="flow">
        {STEPS.map((s) => {
          const isNow = s.n === current;
          const isWaiting = !isNow && (waiting(s.n) > 0 || (s.n === 0 && needsGuide));
          return (
            <li key={s.n} className={isNow ? "current" : isWaiting ? "waiting" : "idle"}>
              <span className="num">{s.n}</span>
              {isNow ? (
                <div className="card-now">
                  <div className="eyebrow">Your next step</div>
                  <div className="t">{s.title}</div>
                  <p>{s.what}</p>
                  <div className="count">{nowLine(s.n)}</div>
                  <Link className="btn" href={s.href}>{s.go} &rarr;</Link>
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
        <Link href="/papers">Browse all papers</Link>
        <Link href="/progress">Team progress</Link>
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
