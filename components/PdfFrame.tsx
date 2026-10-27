"use client";

import { useEffect, useState } from "react";

// Shows a paper's PDF in the left pane.
// The browser downloads the file and shows it from a local address, so the way the storage
// service labels the file (download or inline) cannot leave the viewer blank. If that download
// fails for any reason, it falls back to showing the signed link directly.
const cache = new Map<string, string>();

export default function PdfFrame({ id, version }: { id: string; version: string }) {
  const key = `${id}:${version}`;
  const [src, setSrc] = useState<string | null>(cache.get(key) ?? null);

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) { setSrc(hit); return; }
    let dead = false;
    setSrc(null);
    (async () => {
      try {
        const meta = await fetch(`/api/pdf/${id}?format=url`, { cache: "no-store" });
        if (!meta.ok) throw new Error("link " + meta.status);
        const { url } = (await meta.json()) as { url: string };
        const res = await fetch(url);
        if (!res.ok) throw new Error("file " + res.status);
        const blob = new Blob([await res.arrayBuffer()], { type: "application/pdf" });
        const local = URL.createObjectURL(blob);
        if (cache.size >= 6) {
          const oldest = cache.keys().next().value as string;
          URL.revokeObjectURL(cache.get(oldest)!);
          cache.delete(oldest);
        }
        cache.set(key, local);
        if (!dead) setSrc(local);
      } catch {
        if (!dead) setSrc(`/api/pdf/${id}`);
      }
    })();
    return () => { dead = true; };
  }, [key, id]);

  if (!src) return <div className="pdf-loading">Loading the PDF...</div>;
  return <iframe className="pdf" src={src} title="PDF" />;
}
