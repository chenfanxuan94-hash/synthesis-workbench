import Link from "next/link";

// The only navigation on inner pages: one clear way back to the list.
export default function Back({ href = "/", label = "All papers" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="back">
      <span aria-hidden="true">&larr;</span> {label}
    </Link>
  );
}
