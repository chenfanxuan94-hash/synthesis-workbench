import Link from "next/link";
import type { Library } from "@/lib/library";
import { plural } from "@/lib/format";

// One line at the top of the list: what to do next, and a button that opens it.
export default function NextStep({ lib }: { lib: Library }) {
  if (!lib.ready) return null;
  const toVote = lib.mine.vote.length;
  const toCode = lib.mine.code.length;

  let text: React.ReactNode;
  let href: string | null = null;
  let go = "";
  if (lib.total === 0) {
    text = <>The library is empty. Add the first papers with the button on the right.</>;
  } else if (toVote > 0) {
    text = <><b>{plural(toVote, "paper needs", "papers need")} your vote.</b> Read the title, abstract, or PDF and vote Include or Exclude.</>;
    href = "/work/vote"; go = "Start voting";
  } else if (lib.split > 0) {
    text = <><b>{plural(lib.split, "paper needs", "papers need")} a team decision.</b> Talk them through, then record the decision on each paper&apos;s Edit details tab.</>;
    href = "/?f=split"; go = "Open them";
  } else if (toCode > 0) {
    text = <><b>{plural(toCode, "approved paper is", "approved papers are")} not coded yet.</b> Record the study features and the numbers by group, then mark each paper done.</>;
    href = "/work/code"; go = "Start coding";
  } else {
    text = <>
      <b>Nothing needs you right now.</b>
      {lib.waitingOthers > 0 ? ` ${plural(lib.waitingOthers, "paper")} you voted on ${lib.waitingOthers === 1 ? "is" : "are"} waiting for a second vote from someone else.` : " Papers show up here as your teammates add them and vote."}
    </>;
  }

  return (
    <div className={"nextbar" + (href ? " live" : "")}>
      <span className="eyebrow">Your next step</span>
      <span className="txt">{text}</span>
      {href && <Link className="btn primary" href={href}>{go} &rarr;</Link>}
    </div>
  );
}
