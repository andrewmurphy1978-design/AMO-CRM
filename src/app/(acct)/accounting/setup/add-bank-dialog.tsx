"use client";

import { useState } from "react";
import { addBankAccount } from "@/actions/accounting";
import AccountingDialog from "../accounting-dialog";
import { BankFields } from "./dialog-forms";
import type { CardColor } from "@/components/section-card";
import type { EntityInfo } from "@/lib/accounting/options";

// The "+" in an entity's bank-accounts card: add a bank account, card or registered account (entity preselected).
export default function AddBankDialog({ lang, entities, entityId, color, kindGroup }: { lang: "en" | "fr"; entities: EntityInfo[]; entityId: string; color: CardColor; kindGroup: "bank" | "registered" }) {
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
        <AccountingDialog open onOpenChange={setOpen} title={kindGroup === "registered" ? (fr ? "Ajouter un compte enregistré ou de placement" : "Add a registered or investment account") : fr ? "Ajouter un compte bancaire ou une carte de crédit" : "Add a bank account or credit card"} action={addBankAccount} lang={lang} color={color} saveLabel={fr ? "Ajouter" : "Add"}>
          <BankFields lang={lang} entities={entities} defaultEntityId={entityId} kindGroup={kindGroup} />
        </AccountingDialog>
      )}
    </>
  );
}
