"use client";

import { useState } from "react";
import { addAccount } from "@/actions/accounting";
import AccountingDialog from "../accounting-dialog";
import { AccountFields } from "./dialog-forms";
import type { CardColor } from "@/components/section-card";
import type { AccountOption, EntityInfo } from "@/lib/accounting/options";

// The "+" in a chart card's header: add an account (type preselected to the card's) in the shared CRM dialog.
export default function AddAccountDialog({ lang, entities, options, entityId, type, color }: { lang: "en" | "fr"; entities: EntityInfo[]; options: AccountOption[]; entityId: string; type: string; color: CardColor }) {
  const [open, setOpen] = useState(false);
  const fr = lang === "fr";
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={fr ? "Ajouter un compte" : "Add an account"}
        title={fr ? "Ajouter un compte" : "Add an account"}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-base font-bold normal-case leading-none text-white hover:bg-white/40"
      >
        +
      </button>
      {open && (
        <AccountingDialog open onOpenChange={setOpen} title={fr ? "Ajouter un compte" : "Add an account"} action={addAccount} lang={lang} color={color} saveLabel={fr ? "Ajouter" : "Add"}>
          <AccountFields lang={lang} entities={entities} options={options} defaultEntityId={entityId} defaultType={type} />
        </AccountingDialog>
      )}
    </>
  );
}
