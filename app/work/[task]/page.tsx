import Link from "next/link";
import { redirect } from "next/navigation";
import Back from "@/components/Back";
import { requireMember } from "@/lib/session";
import { loadLibrary, pickNext } from "@/lib/library";
import { TASK_ORDER, TASK_STEP, isTask, type Task } from "@/lib/steps";
import { plural } from "@/lib/format";

export const dynamic = "force-dynamic";

// /work/vote opens the next paper that needs your vote; /work/code the next approved paper
// that is not done. /work/next opens whichever of those has something waiting.
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
  const lib = await loadLibrary(me.id);

  let t: Task | null = null;
  if (task === "next") t = TASK_ORDER.find((k) => lib.mine[k].length > 0) ?? null;
  else if (isTask(task)) t = task;

  if (t) {
    const id = pickNext(lib.mine[t], after);
    if (id) redirect(t === "screen" ? `/search/screen?id=${id}` : `/papers/${id}?task=${t}`);
  }

  const step = isTask(task) ? TASK_STEP[task] : null;
  const other = TASK_ORDER.filter((k) => k !== t && lib.mine[k].length > 0);

  return (
    <main className="center">
      <Back />
      <div className="allclear">
        <b>{step ? `Nothing is left for you in step ${step.n}.` : "Nothing needs you right now."}</b>{" "}
        {task === "vote" && lib.waitingOthers > 0 && `${plural(lib.waitingOthers, "paper")} you voted on ${lib.waitingOthers === 1 ? "is" : "are"} waiting for a second vote from someone else. `}
        {task === "vote" && lib.split > 0 && `${plural(lib.split, "paper")} ${lib.split === 1 ? "is" : "are"} waiting for a team decision. `}
        {task === "code" && lib.counts.approved === 0 && "No paper has been approved yet; coding starts once a paper has two Include votes. "}
        {task === "code" && lib.counts.approved > 0 && "Every approved paper is marked done. "}
        {task === "screen" && lib.screening.total === 0 && "The search list is empty: run a search or add papers on the search page. "}
        {task === "screen" && lib.screening.total > 0 && `You have looked at every candidate that is waiting. ${lib.screening.split > 0 ? plural(lib.screening.split, "candidate") + " need a decision. " : ""}`}
        Every paper is always open from <Link href="/">the list</Link>.
      </div>
      {other.length > 0 && (
        <>
          <h2>Waiting for you at another step</h2>
          {other.map((k) => (
            <div className="item" key={k}>
              <div className="eyebrow">Step {TASK_STEP[k].n}</div>
              <div className="t">{TASK_STEP[k].title}</div>
              <div className="sub" style={{ marginBottom: 12 }}>{plural(lib.mine[k].length, k === "screen" ? "candidate" : "paper")} waiting for you</div>
              <Link className="btn primary" href={TASK_STEP[k].href}>{TASK_STEP[k].go} &rarr;</Link>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
