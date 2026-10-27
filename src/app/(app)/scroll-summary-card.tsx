"use client";

import type { ReactNode } from "react";

// A Summary card that scrolls to its detail card (by element id) when clicked.
export default function ScrollSummaryCard({ targetId, className, children }: { targetId: string; className: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className={className}
    >
      {children}
    </button>
  );
}
