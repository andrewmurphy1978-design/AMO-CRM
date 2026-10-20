"use client";

import { useState } from "react";
import { updateEntity } from "@/actions/accounting";
import { EditCardButton } from "@/app/(app)/contacts/[id]/section-dialog";
import AccountingDialog from "../accounting-dialog";
import { EntityFields } from "../setup/dialog-forms";
import type { CardColor } from "@/components/section-card";
import type { EntityInfo } from "@/lib/accounting/options";

export default function EditEntityDialog({ lang, entity, color }: { lang: "en" | "fr"; entity: EntityInfo; color: CardColor }) {
  const [open, setOpen] = useState(false);
  const fr = lang === "fr";
  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={fr ? "Modifier l'entité" : "Edit entity"} />
      {open && (
        <AccountingDialog open onOpenChange={setOpen} title={entity.name} action={updateEntity.bind(null, entity.id)} lang={lang} color={color}>
          <EntityFields lang={lang} entity={entity} />
        </AccountingDialog>
      )}
    </>
  );
}
