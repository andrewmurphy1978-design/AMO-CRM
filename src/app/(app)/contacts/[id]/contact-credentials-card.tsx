"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { addContactCredential, deleteContactCredential, revealContactCredential } from "@/actions/contact-credentials";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card, { CARD_COLORS } from "@/components/section-card";
import { EditCardButton } from "./section-dialog";

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

const CREDENTIAL_FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

// A self-contained modal rather than the shared SectionDialog — every other
// card's dialog binds one bulk "replace everything" server action to a
// single Save button, but credentials are added/deleted/revealed one at a
// time (each its own server call, so a stored password is never round-
// tripped to the client just to keep it unchanged on an unrelated edit),
// so there's no single action to bind and no Save button to show — just
// Close, with the same colored-header chrome as the other dialogs.
function CredentialsDialog({
  open,
  onClose,
  contactId,
  entries,
  t,
}: {
  open: boolean;
  onClose: () => void;
  contactId: string;
  entries: ContactCredentialRow[];
  t: ReturnType<typeof getDict>;
}) {
  const boundAction = addContactCredential.bind(null, contactId);
  const [state, action, pending] = useActionState(boundAction, undefined);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex shrink-0 items-center justify-between gap-3 px-3 py-2.5 text-white sm:px-4 sm:py-3 ${CARD_COLORS.credentials}`}>
          <h3 className="truncate font-display text-base font-semibold sm:text-lg">{t.contactCredentials.cardTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-white/20 px-2 py-1.5 text-sm font-semibold hover:bg-white/30"
          >
            {t.phaseDialog.cancel}
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-3 sm:p-5">
          <ul className="space-y-2">
            {entries.map((entry) => (
              <CredentialRow key={entry.id} entry={entry} contactId={contactId} t={t} />
            ))}
            {entries.length === 0 && <li className="text-sm text-soft">{t.apiVault.empty}</li>}
          </ul>

          <form action={action} className="space-y-2 border-t border-card-border pt-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <input type="text" name="label" placeholder={t.contactCredentials.labelPlaceholder} className={CREDENTIAL_FIELD_CLASS} />
              <input type="url" name="url" placeholder={t.contactCredentials.urlPlaceholder} className={CREDENTIAL_FIELD_CLASS} />
              <input type="text" name="username" placeholder={t.contactCredentials.usernamePlaceholder} className={CREDENTIAL_FIELD_CLASS} />
              <input type="password" name="password" placeholder={t.contactCredentials.passwordPlaceholder} className={CREDENTIAL_FIELD_CLASS} />
            </div>
            <input type="text" name="notes" placeholder={t.contactCredentials.notesPlaceholder} className={CREDENTIAL_FIELD_CLASS} />
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
      </div>
    </div>
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
  const [open, setOpen] = useState(false);

  return (
    <Card color="credentials" title={t.contactCredentials.cardTitle} compact actions={<EditCardButton onClick={() => setOpen(true)} label={t.contactDetail.edit} />}>
      {entries.length === 0 ? (
        <p className="text-sm text-soft">{t.apiVault.empty}</p>
      ) : (
        <ul className="divide-y divide-card-border">
          {entries.map((entry) => (
            <li key={entry.id} className="py-2 text-sm first:pt-0">
              <p className="font-medium text-ink">{entry.label}</p>
              <p className="text-xs text-soft">
                {[entry.url, entry.username ? `${t.contactCredentials.username}: ${entry.username}` : null, entry.hasPassword ? "••••••••" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {entry.notes && <p className="text-xs text-soft">{entry.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      <CredentialsDialog open={open} onClose={() => setOpen(false)} contactId={contactId} entries={entries} t={t} />
    </Card>
  );
}
