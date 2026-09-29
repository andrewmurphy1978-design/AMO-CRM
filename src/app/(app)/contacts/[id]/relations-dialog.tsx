"use client";

import { useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { FIELD_CLASS, RELATION_TYPE_OPTIONS, type ContactRelationRow, type RelatableContact } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

export default function RelationsDialog({
  action,
  relations: initialRelations,
  allContacts,
  lang,
}: {
  action: (prevState: { error?: string; success?: string } | undefined, formData: FormData) => Promise<{ error?: string; success?: string }>;
  relations: ContactRelationRow[];
  allContacts: RelatableContact[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [open, setOpen] = useState(false);
  const [relations, setRelations] = useState(() => initialRelations.map((row, id) => ({ id, ...row })));
  const nextId = useRef(relations.length);

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardRelatedContacts} action={action} labels={t.phaseDialog} wide>
      <div className="space-y-1.5">
        {relations.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center gap-1.5">
            <select name="relationContactId" defaultValue={row.relatedContactId} className={`${FIELD_CLASS} mt-0 w-full sm:w-56`}>
              <option value="">—</option>
              {allContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || c.id}
                </option>
              ))}
            </select>
            <input
              name="relationType"
              defaultValue={row.relationType}
              list="relationTypeOptions"
              placeholder={t.contactForm.relationTypePlaceholder}
              className={`${FIELD_CLASS} mt-0 w-40`}
            />
            <input name="relationNotes" defaultValue={row.notes ?? ""} placeholder={t.contactForm.notes} className={`${FIELD_CLASS} mt-0 flex-1`} />
            <button
              type="button"
              onClick={() => setRelations((rows) => rows.filter((r) => r.id !== row.id))}
              className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
              aria-label={t.contactForm.removeEntry}
            >
              ✕
            </button>
          </div>
        ))}
        <datalist id="relationTypeOptions">
          {RELATION_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => setRelations((rows) => [...rows, { id: nextId.current++, relatedContactId: "", relationType: "Other", notes: "" }])}
          className="text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.contactForm.addRelatedContact}
        </button>
      </div>
    </SectionDialog>

  </>
  );
}
