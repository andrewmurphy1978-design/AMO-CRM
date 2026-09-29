"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { FIELD_CLASS } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";
import { CARD_COLORS } from "@/components/section-card";

export default function NotesDialog({
  action,
  notes: initialNotes,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  notes: string[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(() => (initialNotes.length > 0 ? initialNotes : [""]).map((text, id) => ({ id, text })));
  const nextId = useRef(notes.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog
      open={open}
      onOpenChange={setOpen}
      title={t.contactForm.cardNotes}
      action={action}
      labels={t.phaseDialog}
      wide
      headerColorClassName={CARD_COLORS.notes}
    >
      <div className="space-y-2">
        {notes.map((row) => (
          <div key={row.id} className="flex items-start gap-1.5">
            <textarea
              name="noteText"
              rows={3}
              defaultValue={row.text}
              className={`${FIELD_CLASS} mt-0 flex-1`}
            />
            <button
              type="button"
              onClick={() => setNotes((rows) => rows.filter((r) => r.id !== row.id))}
              className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
              aria-label={t.contactForm.removeEntry}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setNotes((rows) => [...rows, { id: nextId.current++, text: "" }])}
          className="text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.contactForm.addNote}
        </button>
      </div>
    </SectionDialog>

  </>
  );
}
