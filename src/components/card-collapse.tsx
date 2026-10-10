"use client";

import { useState, type ReactNode } from "react";

// The details of a Brand / Research / Mock-up card (drop zone, working files, images...) can be folded away so
// the card only shows its final reports.
export default function CardCollapse({ fr, children }: { fr: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-xs font-semibold text-soft hover:text-ink">
        {open ? (fr ? "▾ Masquer les détails" : "▾ Hide details") : fr ? "▸ Afficher les détails" : "▸ Show details"}
      </button>
      {open && <div className="space-y-2 sm:space-y-4">{children}</div>}
    </>
  );
}
