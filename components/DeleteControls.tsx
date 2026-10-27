"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePapers } from "@/lib/actions";

export const BULK_FORM = "bulk-delete-form";

// One-row delete in the master list. Asks first, names the paper, and reloads the list.
export function RowDelete({ id, title }: { id: string; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function go() {
    if (!confirm(`Delete "${title}" and everything recorded for it (votes, coding, effect rows)? This cannot be undone.`)) return;
    start(async () => {
      const r = await deletePapers([id]);
      if (!r.ok) { alert("Could not delete: " + r.error); return; }
      router.refresh();
    });
  }
  return <button type="button" className="small danger" onClick={go} disabled={pending} title="Delete this paper">{pending ? "..." : "Delete"}</button>;
}

// Submit button for the "delete the checked papers" form. Counts the boxes, asks once.
export function DeleteSelectedButton() {
  const [n, setN] = useState(0);
  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form || document.getElementById(BULK_FORM);
    const checked = form ? form.querySelectorAll<HTMLInputElement>('input[name="ids"]:checked').length : 0;
    setN(checked);
    if (checked === 0) { e.preventDefault(); alert("Tick the box next to each paper you want to delete first."); return; }
    if (!confirm(`Delete ${checked} selected ${checked === 1 ? "paper" : "papers"} and everything recorded for ${checked === 1 ? "it" : "them"}? This cannot be undone.`)) e.preventDefault();
  }
  // The button sits above the table, outside the form, so it names the form explicitly.
  return <button type="submit" form={BULK_FORM} className="small danger" onClick={onClick}>Delete selected{n ? ` (${n})` : ""}</button>;
}

// Header checkbox that ticks or clears every row shown.
export function SelectAll() {
  return (
    <input
      type="checkbox"
      aria-label="Select all shown"
      title="Select all shown"
      onChange={(e) => {
        const form = e.currentTarget.form;
        form?.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((b) => { b.checked = e.currentTarget.checked; });
      }}
    />
  );
}
