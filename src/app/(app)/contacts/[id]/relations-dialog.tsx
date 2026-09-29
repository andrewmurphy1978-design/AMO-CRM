"use client";

import { useMemo, useRef, useState } from "react";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { FIELD_CLASS, RELATION_TYPE_OPTIONS, type ContactRelationRow, type RelatableContact } from "../contact-form";
import SectionDialog, { EditCardButton } from "./section-dialog";

function contactLabel(c: RelatableContact) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || c.id;
}

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
  const [relations, setRelations] = useState(() => initialRelations.map((row, id) => ({ id, search: "", ...row })));
  const nextId = useRef(relations.length);

  function updateRow(id: number, patch: Partial<(typeof relations)[number]>) {
    setRelations((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  return (
    <>
      <EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />
    <SectionDialog open={open} onOpenChange={setOpen} title={t.contactForm.cardRelatedContacts} action={action} labels={t.phaseDialog} wide>
      <div className="space-y-1.5">
        {relations.map((row) => (
          <RelationRow key={row.id} row={row} allContacts={allContacts} t={t} onChange={(patch) => updateRow(row.id, patch)} onRemove={() => setRelations((rows) => rows.filter((r) => r.id !== row.id))} />
        ))}
        <datalist id="relationTypeOptions">
          {RELATION_TYPE_OPTIONS.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => setRelations((rows) => [...rows, { id: nextId.current++, relatedContactId: "", relationType: "Other", notes: "", search: "" }])}
          className="text-xs font-semibold text-amo-lime hover:underline"
        >
          + {t.contactForm.addRelatedContact}
        </button>
      </div>
    </SectionDialog>

  </>
  );
}

function RelationRow({
  row,
  allContacts,
  t,
  onChange,
  onRemove,
}: {
  row: { id: number; relatedContactId: string; relationType: string; notes?: string | null; search: string };
  allContacts: RelatableContact[];
  t: ReturnType<typeof getDict>;
  onChange: (patch: Partial<{ relatedContactId: string; relationType: string; notes: string; search: string }>) => void;
  onRemove: () => void;
}) {
  const selected = row.relatedContactId ? allContacts.find((c) => c.id === row.relatedContactId) ?? null : null;
  const query = row.search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = query ? allContacts.filter((c) => contactLabel(c).toLowerCase().includes(query)) : allContacts;
    return list.slice(0, 20);
  }, [allContacts, query]);

  return (
    <div className="flex flex-wrap items-start gap-1.5">
      <div className="w-full sm:w-56">
        <input type="hidden" name="relationContactId" value={row.relatedContactId} readOnly />
        {selected ? (
          <div className="flex items-center justify-between rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink">
            <span className="truncate">{contactLabel(selected)}</span>
            <button type="button" onClick={() => onChange({ relatedContactId: "" })} className="ml-2 shrink-0 text-xs text-soft hover:underline">
              {t.linkPicker.clear}
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={row.search}
              onChange={(e) => onChange({ search: e.target.value })}
              placeholder={t.linkPicker.searchPlaceholder}
              className={`${FIELD_CLASS} mt-0`}
            />
            {query && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-card-border">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-soft">{t.linkPicker.noResults}</p>
                ) : (
                  filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onChange({ relatedContactId: c.id, search: "" })}
                      className="block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-amo-lime/10"
                    >
                      {contactLabel(c)}
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
      <input
        name="relationNotes"
        defaultValue={row.notes ?? ""}
        placeholder={t.contactForm.notes}
        className={`${FIELD_CLASS} mt-0 flex-1`}
      />
      <input
        name="relationType"
        defaultValue={row.relationType}
        list="relationTypeOptions"
        placeholder={t.contactForm.relationTypePlaceholder}
        className={`${FIELD_CLASS} mt-0 w-40`}
      />
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-md border border-card-border px-2 py-2 text-xs text-soft hover:text-ink"
        aria-label={t.contactForm.removeEntry}
      >
        ✕
      </button>
    </div>
  );
}
