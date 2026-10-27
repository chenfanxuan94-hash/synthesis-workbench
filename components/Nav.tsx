import Link from "next/link";
import { logout } from "@/lib/actions";
import type { Member } from "@/lib/types";

export default function Nav({ me, active }: { me: Member; active?: string }) {
  const cls = (k: string) => "link" + (active === k ? " on" : "");
  return (
    <nav className="top">
      <Link href="/" className="brand">Synthesis Workbench</Link>
      <Link href="/guide" className={cls("guide")}>Start here</Link>
      <Link href="/" className={cls("home")}>Dashboard</Link>
      <Link href="/papers" className={cls("papers")}>All papers</Link>
      <Link href="/papers/new" className={cls("new")}>Add papers</Link>
      <Link href="/conflicts" className={cls("conflicts")}>Disagreements</Link>
      <Link href="/dataset" className={cls("dataset")}>Dataset</Link>
      <span className="who">
        <Link href="/work/next" className="nexttask" title="Opens the next paper that is waiting for you">My next task</Link>
        <span className="me">{me.name}</span>
        <form action={logout}>
          <button type="submit" className="small">Switch user</button>
        </form>
      </span>
    </nav>
  );
}
