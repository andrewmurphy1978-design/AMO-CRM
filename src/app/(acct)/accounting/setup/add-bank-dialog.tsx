"use client";

import { useState } from "react";
import { AddBankForm } from "./setup-forms";
import type { EntityInfo } from "@/lib/accounting/options";

// The "+" in an entity's bank-accounts card: the add-an-account form in a dialog (entity preselected).
export default function AddBankDialog({ lang, entities, entityId }: { lang: "en" | "fr"; entities: EntityInfo[]; entityId: string }) {
  const [open, setOpen] = useState(false);
  const fr = lang === "fr";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fr ? "Ajouter un compte bancaire" : "Add a bank account"}
        title={fr ? "Ajouter un compte bancaire" : "Add a bank account"}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-base font-bold normal-case leading-none text-white hover:bg-white/40"
      >
        +
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl normal-case" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{fr ? "Ajouter un compte bancaire, une carte ou un compte enregistré" : "Add a bank account, card or registered account"}</h2>
              <button onClick={() => setOpen(false)} className="text-soft hover:text-ink" aria-label="Close">✕</button>
            </div>
            <AddBankForm lang={lang} entities={entities} defaultEntityId={entityId} onDone={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
