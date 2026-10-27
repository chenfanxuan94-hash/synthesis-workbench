"use client";

import { useRef, useState } from "react";

export default function Help({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [left, setLeft] = useState(false);
  function onEnter() {
    const r = ref.current?.getBoundingClientRect();
    if (r) setLeft(r.left + 330 > window.innerWidth);
  }
  return (
    <span ref={ref} className={"help" + (left ? " left" : "")} aria-label={text} onMouseEnter={onEnter}>
      ?
      <span className="tip">{text}</span>
    </span>
  );
}
