"use client";

import { useActionState, useState, useTransition } from "react";
import { addVaultEntry, deleteVaultEntry, revealVaultEntry, updateVaultExpiry } from "@/actions/api-key-vault";
import ExpiryField, { ExpiryBadge } from "./expiry-field";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export interface VaultEntry {
  id: string;
  label: string;
  notes: string | null;
  source?: string | null;
  expiresAt?: string | null;
  noExpiry?: boolean;
}

function EntryRow({ entry, t, lang }: { entry: VaultEntry; t: ReturnType<typeof getDict>; lang: Lang }) {
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleReveal() {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    startTransition(async () => {
      const result = await revealVaultEntry(entry.id);
      if (result.error) setError(result.error);
      else setRevealed(result.value ?? "");
    });
  }

  function copy() {
    if (revealed === null) return;
    navigator.clipboard
      .writeText(revealed)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  function remove() {
    startTransition(() => deleteVaultEntry(entry.id));
  }

  return (
    <li className="rounded-lg border border-card-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{entry.label}</p>
          {entry.notes && <p className="truncate text-xs text-soft">{entry.notes}</p>}
          <p className="mt-0.5">
            <ExpiryBadge expiry={{ expiresAt: entry.expiresAt ?? null, noExpiry: Boolean(entry.noExpiry) }} lang={lang} />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={toggleReveal} disabled={pending} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-60">
            {revealed !== null ? t.apiVault.hide : t.apiVault.reveal}
          </button>
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-xs font-medium text-soft hover:underline">
            {t.apiVault.editExpiry}
          </button>
          <button type="button" onClick={remove} disabled={pending} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60">
            {t.apiVault.delete}
          </button>
        </div>
      </div>
      {revealed !== null && (
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded bg-field-bg px-2 py-1 text-xs text-ink">{revealed}</code>
          <button type="button" onClick={copy} className="shrink-0 text-xs font-medium text-soft hover:underline">
            {copied ? t.apiVault.copied : t.apiVault.copy}
          </button>
        </div>
      )}
      {editing && (
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          action={(fd) =>
            startTransition(async () => {
              const res = await updateVaultExpiry(entry.id, fd);
              if (res.error) setError(res.error);
              else {
                setError(null);
                setEditing(false);
              }
            })
          }
        >
          <ExpiryField lang={lang} />
          <button type="submit" disabled={pending} className="rounded-md border border-card-border px-3 py-2 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-60">
            {t.apiVault.saveExpiry}
          </button>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export default function ApiKeyVaultForm({ entries, lang }: { entries: VaultEntry[]; lang: Lang }) {
  const t = getDict(lang);
  const [state, action, pending] = useActionState(addVaultEntry, undefined);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} t={t} lang={lang} />
        ))}
        {entries.length === 0 && <li className="text-sm text-soft">{t.apiVault.empty}</li>}
      </ul>

      <form action={action} className="space-y-2 border-t border-card-border pt-4">
        <input
          type="text"
          name="label"
          placeholder={t.apiVault.labelPlaceholder}
          className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <input
          type="password"
          name="value"
          placeholder={t.apiVault.valuePlaceholder}
          className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <input
          type="text"
          name="notes"
          placeholder={t.apiVault.notesPlaceholder}
          className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <ExpiryField lang={lang} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {pending ? t.apiVault.adding : t.apiVault.add}
        </button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}
      </form>
    </div>
  );
}
