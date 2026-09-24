"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Measures its own distance from the top of the viewport (same technique as
// CalendarShell's grid height) so the list's own scrollbar reaches exactly
// to the bottom of the screen — with <main>'s normal p-4/sm:p-8 bottom
// padding — instead of a static calc() guess that drifts whenever the
// header or filter row above it changes height. `scrollbarGutter: "stable"`
// reserves the vertical scrollbar's width up front, so it appearing never
// shrinks the available width and forces an unwanted horizontal scrollbar.
//
// The height itself is a `calc(100dvh - Npx)` string, not a `window.innerHeight`
// px value: `dvh` stays live as the browser's own CSS engine tracks it, so it
// shrinks/grows with the mobile address bar in real time — a `resize`-driven
// `window.innerHeight` read only catches up on the next resize event, which is
// exactly what left a lingering blank-space-below-the-list gap on mobile.
export default function ScrollableList({ children, className }: { children: ReactNode; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState("calc(100dvh - 260px)");

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const top = containerRef.current.getBoundingClientRect().top;
      const bottomPadding = window.innerWidth >= 640 ? 32 : 16;
      setHeight(`max(240px, calc(100dvh - ${top + bottomPadding}px))`);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, overflowY: "auto", overflowX: "hidden", scrollbarGutter: "stable" }}
    >
      {children}
    </div>
  );
}
