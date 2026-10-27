"use client";

import { useEffect, useState } from "react";
import { ago } from "@/lib/format";

// Relative time ("5 min ago") rendered only in the browser, so the server-rendered page and
// the browser never disagree about what "now" is.
export default function Ago({ iso }: { iso: string | null | undefined }) {
  const [text, setText] = useState("");
  useEffect(() => { setText(ago(iso)); }, [iso]);
  return <span suppressHydrationWarning>{text}</span>;
}
