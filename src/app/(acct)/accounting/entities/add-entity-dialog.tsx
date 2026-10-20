"use client";

import { useState } from "react";
import { addEntity } from "@/actions/accounting";
import AccountingDialog from "../accounting-dialog";
import { EntityFields } from "../setup/dialog-forms";

export default function AddEntityDialog({ lang }: { lang: "en" | "fr" }) {
  const [open, setOpen] = useState(false);
  const fr = lang === "fr";
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
        + {fr ? "Ajouter une société / LLC" : "Add a corporation / LLC"}
      </button>
      {open && (
        <AccountingDialog open onOpenChange={setOpen} title={fr ? "Nouvelle entité" : "New entity"} action={addEntity} lang={lang} color="general" saveLabel={fr ? "Créer" : "Create"}>
          <EntityFields lang={lang} />
        </AccountingDialog>
      )}
    </>
  );
}
