"use client";

import { useState } from "react";
import { AddEntityForm } from "../setup/setup-forms";

export default function AddEntityDialog({ lang }: { lang: "en" | "fr" }) {
  const [open, setOpen] = useState(false);
  const fr = lang === "fr";
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
        + {fr ? "Ajouter une société / LLC" : "Add a corporation / LLC"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{fr ? "Nouvelle entité" : "New entity"}</h2>
              <button onClick={() => setOpen(false)} className="text-soft hover:text-ink" aria-label="Close">✕</button>
            </div>
            <AddEntityForm lang={lang} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
