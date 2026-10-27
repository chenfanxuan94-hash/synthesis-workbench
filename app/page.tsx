import Link from "next/link";
import Nav from "@/components/Nav";
import Help from "@/components/Help";
import { db } from "@/lib/supabase";
import { requireMember, allMembers } from "@/lib/session";
import { loadQueues } from "@/lib/queue";
import { STEPS, TASK_ORDER, TASK_STEP } from "@/lib/steps";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const me = await requireMember();
  const members = await allMembers();
  const q = await loadQueues(me.id);
  const d = db();
  const [{ data: screenings }, { data: codings }, { data: effects }] = await Promise.all([
    d.from("screenings").select("member_id"),
    d.from("codings").select("coder_id"),
    d.from("effects").select("entered_by,verified_by"),
  ]);

  const next = TASK_ORDER.find((k) => q.mine[k].length > 0);
  const conflicts = q.counts.abstract_conflict + q.counts.fulltext_conflict;
  const firstTime = (screenings || []).filter((s: any) => s.member_id === me.id).length === 0;

  function stepCounts(n: number) {
    switch (n) {
      case 0: return firstTime ? <><span className="count">start here</span>read this before your first paper</> : <>Always available under Start here in the top bar.</>;
      case 1: return <><span className="count">{q.total}</span>papers in the library</>;
      case 2: return <><Count n={q.mine.abstract.length} />waiting for you &nbsp; <span className="count zero">{q.counts.abstract_pending}</span>at this step for the team</>;
      case 3: return <><Count n={q.mine.fulltext.length} />waiting for you &nbsp; <span className="count zero">{q.counts.fulltext_pending}</span>at this step{q.noPdfFulltext ? `, ${q.noPdfFulltext} still need a PDF` : ""}</>;
      case 4: return <><Count n={conflicts} />disagreements to talk through</>;
      case 5: return <><Count n={q.mine.code.length} />waiting for you &nbsp; <span className="count zero">{q.counts.included}</span>included papers</>;
      case 6: return <><Count n={q.mine.extract.length} />papers with numbers to copy</>;
      case 7: return <><Count n={q.mine.verify.length} />papers with rows to check</>;
      case 8: return <><span className="count zero">{q.effects}</span>rows, {q.verified} checked</>;
      default: return null;
    }
  }
  function waiting(n: number): number {
    if (n === 4) return conflicts;
    const s = STEPS[n];
    return s.task ? q.mine[s.task].length : 0;
  }

  const total = Math.max(q.total, 1);
  const seg = [
    { k: "abstract_pending", v: q.counts.abstract_pending, l: "Abstract screening" },
    { k: "fulltext_pending", v: q.counts.fulltext_pending, l: "Full-text screening" },
    { k: "conflict", v: conflicts, l: "Disagreements" },
    { k: "included", v: q.counts.included, l: "Included" },
    { k: "excluded", v: q.counts.excluded, l: "Excluded" },
  ];

  return (
    <>
      <Nav me={me} active="home" />
      <main>
        <h1>Hello, {me.name}</h1>
        <p className="lead">This page shows what is waiting for you. Work from top to bottom through the steps, or just press the button below.</p>

        {firstTime && (
          <div className="note info">
            <b>New here?</b> Start with <Link href="/guide">Step 0, the guide</Link>. It takes about fifteen minutes and explains every word and button you will see.
          </div>
        )}

        {next ? (
          <div className="hero">
            <span className="stepnum" style={{ background: "#fff", color: "var(--maroon-dark)", width: 46, height: 46, fontSize: 20 }}>{TASK_STEP[next].n}</span>
            <div className="grow">
              <h2>Your next task: {TASK_STEP[next].title}</h2>
              <p>{q.mine[next].length} {q.mine[next].length === 1 ? "paper is" : "papers are"} waiting for you. The button opens the first one, with instructions at the top.</p>
            </div>
            <Link className="btn" href={TASK_STEP[next].href}>{TASK_STEP[next].go} &rarr;</Link>
          </div>
        ) : (
          <div className="hero done">
            <div className="grow">
              <h2>You are all caught up</h2>
              <p>
                Nothing is waiting for you right now.
                {conflicts > 0 ? ` There ${conflicts === 1 ? "is 1 disagreement" : `are ${conflicts} disagreements`} for the team to talk through (step 4).` : ""}
                {q.total === 0 ? " The library is empty: start with step 1, Add papers." : ""}
              </p>
            </div>
            {conflicts > 0 ? <Link className="btn" href="/conflicts">Open disagreements</Link> : q.total === 0 ? <Link className="btn" href="/papers/new">Add papers</Link> : null}
          </div>
        )}

        <h2>
          The steps
          <Help text="Every paper moves through these steps in order. The numbers in maroon are what is waiting for you specifically. Each button opens the next paper for that step, so you never need to search for what to do." />
        </h2>
        <div className="steps">
          {STEPS.map((s) => (
            <div className={"step" + (waiting(s.n) > 0 ? " active" : "")} key={s.n}>
              <span className="stepnum">{s.n}</span>
              <div className="body">
                <div className="title">{s.title}</div>
                <div className="what">{s.what} <i>({s.who})</i></div>
                <div className="counts">{stepCounts(s.n)}</div>
                <Link className={"btn" + (waiting(s.n) > 0 ? " primary" : "")} href={s.href}>{s.go}</Link>
              </div>
            </div>
          ))}
        </div>

        <h2>
          Where all papers are
          <Help text="Every paper in the library, colored by the step it is at. Papers move from left to right as the team works." />
        </h2>
        <div className="pipe">
          {seg.filter((x) => x.v > 0).map((x) => (
            <div key={x.k} className={x.k} style={{ width: `${(100 * x.v) / total}%` }} title={`${x.l}: ${x.v}`} />
          ))}
        </div>
        <div className="legend">
          {seg.map((x) => <span key={x.k} className={x.k}>{x.l}: <b>{x.v}</b></span>)}
        </div>

        <h2>Team activity</h2>
        <table className="grid" style={{ maxWidth: 720 }}>
          <thead><tr><th>Member</th><th>Screening decisions</th><th>Papers coded</th><th>Rows entered</th><th>Rows checked</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td><b>{m.name}</b>{m.id === me.id ? " (you)" : ""}</td>
                <td>{(screenings || []).filter((s: any) => s.member_id === m.id).length}</td>
                <td>{(codings || []).filter((c: any) => c.coder_id === m.id).length}</td>
                <td>{(effects || []).filter((e: any) => e.entered_by === m.id).length}</td>
                <td>{(effects || []).filter((e: any) => e.verified_by === m.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </>
  );
}

function Count({ n }: { n: number }) {
  return <span className={"count" + (n === 0 ? " zero" : "")}>{n}</span>;
}
