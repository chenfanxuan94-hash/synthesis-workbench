import Link from "next/link";

// The only navigation on inner pages: one clear way back to the steps.
export default function Back({ href = "/", label = "Home" }: { href?: string; label?: string }) {
  return (
    <Link href={href} className="back">
      <span aria-hidden="true">&larr;</span> {label}
    </Link>
  );
}
