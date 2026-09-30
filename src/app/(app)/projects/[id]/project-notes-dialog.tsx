"use client";

import { useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { CARD_COLORS } from "@/components/section-card";
import SectionDialog, { EditCardButton } from "../../contacts/[id]/section-dialog";

// The project page's Notes card dialog: the project's free-text notes.
export default function ProjectNotesDialog({
  action,
  description,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  description: string;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
      <SectionDialog
        open={open}
        onOpenChange={setOpen}
        title={t.projectDetail.notesTitle}
        action={action}
        labels={t.phaseDialog}
        wide
        headerColorClassName={CARD_COLORS.notes}
      >
        <textarea
          name="description"
          rows={12}
          defaultValue={description}
          className="w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
      </SectionDialog>
    </>
  );
}
