import Link from "next/link";
import { redirect } from "next/navigation";
import Back from "@/components/Back";
import { requireMember } from "@/lib/session";
import { loadQueues, pickNext } from "@/lib/queue";
import { TASK_ORDER, TASK_STEP, isTask, type Task } from "@/lib/steps";

export const dynamic = "force-dynamic";

// /work/abstract, /work/fulltext, /work/code, /work/extract, /work/verify open the next paper
// waiting on you at that step. /work/next opens the first step that has anything waiting.
export default async function WorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ task: string }>;
  searchParams: Promise<{ after?: string }>;
}) {
  const { task } = await params;
  const { after } = await searchParams;
  const me = await requireMember();
  const q = await loadQueues(me.id);

  let t: Task | null = null;
  if (task === "next") t = TASK_ORDER.find((k) => q.mine[k].length > 0) ?? null;
  else if (isTask(task)) t = task;

  if (t) {
    const id = pickNext(q.mine[t], after);
    if (id) redirect(`/papers/${id}?task=${t}`);
  }

  const step = isTask(task) ? TASK_STEP[task] : null;
  const other = TASK_ORDER.filter((k) => q.mine[k].length > 0);

  return (
    <main className="center">
      <Back />
      <div className="allclear">
        <b>{step ? `Nothing is left for you in step ${step.n}.` : "You are all caught up."}</b>{" "}
        {step ? `There are no papers waiting for you in "${step.title}".` : "Nothing is waiting for you at any step."}{" "}
        {task === "fulltext" || task === "abstract" ? "Papers you have screened move on once the second person has also decided." : ""}
      </div>
      {other.length > 0 && (
        <>
          <h2>Waiting for you at other steps</h2>
          {other.map((k) => (
            <div className="item" key={k}>
              <div className="eyebrow">Step {TASK_STEP[k].n}</div>
              <div className="t">{TASK_STEP[k].title}</div>
              <div className="sub" style={{ marginBottom: 12 }}>{q.mine[k].length} waiting for you</div>
              <Link className="btn primary" href={TASK_STEP[k].href}>{TASK_STEP[k].go} &rarr;</Link>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
