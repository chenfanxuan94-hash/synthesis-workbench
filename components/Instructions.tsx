"use client";

import { useEffect, useState } from "react";

// Collapsible "what to do" box at the top of a task. Closed by default: one line that opens on a
// click. If a person opens it, it stays open for them at that step until they close it again.
export default function Instructions({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem("wb_hide_" + id) === "0");
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
