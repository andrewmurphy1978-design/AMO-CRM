"use client";

import { useActionState, useState, useTransition } from "react";
import { addEmailAddressColor, updateEmailAddressColor, deleteEmailAddressColor } from "@/actions/email-address-colors";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export interface EmailAddressColorRow {
  id: string;
  address: string;
  color: string;
}

function Row({ id, address, color, t }: { id: string; address: string; color: string; t: ReturnType<typeof getDict> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(color);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateEmailAddressColor(id, value);
      setEditing(false);
    });
  }

  function remove() {
    startTransition(() => deleteEmailAddressColor(id));
  }

  return (
    <li className="flex items-center gap-2">
      <span className="h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: editing ? value : color }} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{address}</span>
      {editing ? (
        <>
          <input
            type="color"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 w-10 shrink-0 cursor-pointer rounded border border-card-border bg-field-bg p-0.5"
          />
          <button type="button" onClick={save} disabled={pending} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-60">
            {t.settings.emailAddressColorSave}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-soft hover:underline">
            {t.settings.emailAddressColorCancel}
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-soft hover:underline">
            {t.settings.emailAddressColorEdit}
          </button>
          <button type="button" onClick={remove} disabled={pending} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60">
            {t.settings.emailAddressColorDelete}
          </button>
        </>
      )}
    </li>
  );
}

export default function EmailAddressColorForm({ rows, lang }: { rows: EmailAddressColorRow[]; lang: Lang }) {
  const t = getDict(lang);
  const [saveState, saveAction, savePending] = useActionState(addEmailAddressColor, undefined);
  const [newColor, setNewColor] = useState("#22c55e");

  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <Row key={row.id} id={row.id} address={row.address} color={row.color} t={t} />
        ))}
        {rows.length === 0 && <li className="text-sm text-soft">{t.settings.emailAddressColorEmpty}</li>}
      </ul>
      <form action={saveAction} className="mt-3 flex items-center gap-2">
        <input
          type="email"
          name="address"
          placeholder={t.settings.emailAddressColorAddPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <input
          type="color"
          name="color"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
          className="h-7 w-10 shrink-0 cursor-pointer rounded border border-card-border bg-field-bg p-0.5"
        />
        <button
          type="submit"
          disabled={savePending}
          className="shrink-0 rounded-md border border-card-border px-3 py-1 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {t.settings.emailAddressColorAdd}
        </button>
      </form>
      {saveState?.error && <p className="mt-1 text-xs text-red-600">{saveState.error}</p>}
    </div>
  );
}
