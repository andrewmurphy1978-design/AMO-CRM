"use client";

import { useActionState, useState, useTransition } from "react";
import { addContactCredential, deleteContactCredential, revealContactCredential } from "@/actions/contact-credentials";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card from "@/components/section-card";

export interface ContactCredentialRow {
  id: string;
  label: string;
  url: string | null;
  username: string | null;
  hasPassword: boolean;
  notes: string | null;
}

function CredentialRow({ entry, contactId, t }: { entry: ContactCredentialRow; contactId: string; t: ReturnType<typeof getDict> }) {
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
      const result = await revealContactCredential(entry.id);
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

  return (
    <li className="rounded-lg border border-card-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{entry.label}</p>
          {entry.url && (
            <a href={entry.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-sky-700 hover:underline">
              {entry.url}
            </a>
          )}
          {entry.username && <p className="truncate text-xs text-soft">{t.contactCredentials.username}: {entry.username}</p>}
          {entry.notes && <p className="truncate text-xs text-soft">{entry.notes}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {entry.hasPassword && (
            <button type="button" onClick={toggleReveal} disabled={pending} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-60">
              {revealed !== null ? t.apiVault.hide : t.apiVault.reveal}
            </button>
          )}
          <button
            type="button"
            onClick={() => startTransition(() => deleteContactCredential(contactId, entry.id))}
            disabled={pending}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
          >
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
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export default function ContactCredentialsCard({
  contactId,
  entries,
  lang,
}: {
  contactId: string;
  entries: ContactCredentialRow[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const boundAction = addContactCredential.bind(null, contactId);
  const [state, action, pending] = useActionState(boundAction, undefined);

  return (
    <Card color="credentials" title={t.contactCredentials.cardTitle}>
      <div className="space-y-4">
        <ul className="space-y-2">
          {entries.map((entry) => (
            <CredentialRow key={entry.id} entry={entry} contactId={contactId} t={t} />
          ))}
          {entries.length === 0 && <li className="text-sm text-soft">{t.apiVault.empty}</li>}
        </ul>

        <form action={action} className="space-y-2 border-t border-card-border pt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              name="label"
              placeholder={t.contactCredentials.labelPlaceholder}
              className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
            <input
              type="url"
              name="url"
              placeholder={t.contactCredentials.urlPlaceholder}
              className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
            <input
              type="text"
              name="username"
              placeholder={t.contactCredentials.usernamePlaceholder}
              className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
            <input
              type="password"
              name="password"
              placeholder={t.contactCredentials.passwordPlaceholder}
              className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
            />
          </div>
          <input
            type="text"
            name="notes"
            placeholder={t.contactCredentials.notesPlaceholder}
            className="w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
          />
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
    </Card>
  );
}
