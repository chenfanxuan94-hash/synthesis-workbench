"use client";

import { useEffect, useState } from "react";

// Collapsible "what to do" box shown at the top of a task. Open for the first three papers a
// person works on at that step, then tucked into one line. Their own hide or show choice wins.
const counted = new Set<string>();

export default function Instructions({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      const key = id + (typeof location !== "undefined" ? location.pathname : "");
      const first = !counted.has(key);
      counted.add(key);
      const before = Number(localStorage.getItem("wb_seen_" + id) || "0");
      if (first) localStorage.setItem("wb_seen_" + id, String(before + 1));
      const seen = first ? before + 1 : before;
      const pref = localStorage.getItem("wb_hide_" + id);
      if (pref === "1") setOpen(false);
      else if (pref === "0") setOpen(true);
      else setOpen(seen <= 3);
    } catch { /* storage unavailable */ }
  }, [id]);
  return (
    <details
      className="howto"
      open={open}
      onToggle={(e) => {
        const o = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(o);
        try { localStorage.setItem("wb_hide_" + id, o ? "0" : "1"); } catch { /* storage unavailable */ }
      }}
    >
      <summary>{title}</summary>
      {children}
    </details>
  );
}
