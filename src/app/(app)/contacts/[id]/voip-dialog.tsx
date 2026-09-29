"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { VOIP_APPS } from "@/lib/platform-icons";
import { AppHandleListBody, type AppHandleRow } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

export default function VoipDialog({
  action,
  voipAccounts: initialAccounts,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  voipAccounts: AppHandleRow[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [voipAccounts, setVoipAccounts] = useState(() => initialAccounts.map((row, id) => ({ id, ...row })));
  const nextId = useRef(voipAccounts.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardVoipApps} action={action} labels={t.phaseDialog}>
      <AppHandleListBody
        addLabel={t.contactForm.addVoipApp}
        handlePlaceholder={t.contactForm.voipHandle}
        appFieldName="voipApp"
        handleFieldName="voipHandle"
        appOptions={VOIP_APPS}
        rows={voipAccounts}
        setRows={setVoipAccounts}
        removeLabel={t.contactForm.removeEntry}
        onAdd={() => setVoipAccounts((rows) => [...rows, { id: nextId.current++, app: VOIP_APPS[0], handle: "" }])}
      />
    </SectionDialog>

  </>
  );
}
