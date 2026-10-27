import Link from "next/link";

// The two faces of the library: the master list and the add page, as tabs on one page.
export default function PageTabs({ current }: { current: "list" | "add" }) {
  return (
    <nav className="pagetabs" aria-label="Library">
      <Link href="/papers" className={current === "list" ? "on" : ""}>All papers</Link>
      <Link href="/papers/new" className={current === "add" ? "on" : ""}>Add papers</Link>
    </nav>
  );
}
