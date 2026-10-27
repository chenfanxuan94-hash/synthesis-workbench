import Link from "next/link";
import { logout } from "@/lib/actions";
import type { Member } from "@/lib/types";

export default function Nav({ me, active }: { me: Member; active?: string }) {
  const cls = (k: string) => (active === k ? "on" : undefined);
  return (
    <nav className="top">
      <span className="brand">Synthesis Workbench</span>
      <Link href="/" className={cls("home")}>Dashboard</Link>
      <Link href="/papers" className={cls("papers")}>Papers</Link>
      <Link href="/papers/new" className={cls("new")}>Add papers</Link>
      <Link href="/conflicts" className={cls("conflicts")}>Conflicts</Link>
      <Link href="/dataset" className={cls("dataset")}>Dataset</Link>
      <span className="who">
        <span>{me.name}</span>
        <form action={logout}>
          <button type="submit" className="small">Switch user</button>
        </form>
      </span>
    </nav>
  );
}
