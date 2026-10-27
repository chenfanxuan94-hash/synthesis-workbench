"use client";

import { useRef, useState } from "react";

// A big, obvious place to drop files or click to choose them.
// `accept` is a comma-separated list of extensions (.pdf) or MIME types (application/pdf).
export default function DropZone({
  accept, multiple = false, disabled = false, size = "big", title, hint, onFiles,
}: {
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  size?: "big" | "normal" | "small";
  title: string;
  hint: string;
  onFiles: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [bad, setBad] = useState("");
  const kinds = accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

  function ok(f: File) {
    const name = f.name.toLowerCase();
    return kinds.some((k) => (k.startsWith(".") ? name.endsWith(k) : k.endsWith("/*") ? f.type.startsWith(k.slice(0, -1)) : f.type === k || (k === "application/pdf" && name.endsWith(".pdf"))));
  }
  function take(list: FileList | null) {
    if (!list || list.length === 0) return;
    const all = Array.from(list);
    const good = all.filter(ok);
    setBad(good.length < all.length ? `${all.length - good.length} file${all.length - good.length === 1 ? " was" : "s were"} skipped because ${all.length - good.length === 1 ? "it is" : "they are"} not the right kind of file.` : "");
    if (good.length) onFiles(multiple ? good : good.slice(0, 1));
    if (input.current) input.current.value = "";
  }

  return (
    <div
      className={"drop" + (size === "big" ? " big" : size === "small" ? " small" : "") + (over ? " over" : "") + (disabled ? " off" : "")}
      role="button"
      tabIndex={0}
      onClick={() => { if (!disabled) input.current?.click(); }}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !disabled) { e.preventDefault(); input.current?.click(); } }}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files); }}
    >
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
      </svg>
      <div className="drop-title">{title}</div>
      <div className="drop-hint">{hint}</div>
      {bad && <div className="drop-bad">{bad}</div>}
      <input ref={input} type="file" accept={accept} multiple={multiple} hidden onChange={(e) => take(e.target.files)} />
    </div>
  );
}
