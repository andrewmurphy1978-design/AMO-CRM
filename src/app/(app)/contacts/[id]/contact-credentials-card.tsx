"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { addContactCredential, deleteContactCredential, revealContactCredential } from "@/actions/contact-credentials";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card, { CARD_COLORS } from "@/components/section-card";
import { EditCardButton } from "./section-dialog";
import { CREDENTIAL_LOGIN_METHODS } from "@/lib/contact-form-fields";

export interface ContactCredentialRow {
  id: string;
  label: string;
  url: string | null;
  username: string | null;
  hasPassword: boolean;
  loginMethod: string | null;
  notes: string | null;
}

// A stored URL is free text — "example.com/login" would otherwise resolve
// relative to the CRM's own address, and a "javascript:" one must never
// become a live link.
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null;
  return `https://${url}`;
}

interface ScreenDetailsLike {
  screens: { availLeft: number; availTop: number; availWidth: number; availHeight: number }[];
  currentScreen: unknown;
}

// Opens the link in a new window, on a different monitor when the browser
// lets us (Chromium's Window Management API — asks the user for permission
// once, only when more than one screen is connected). Anywhere that isn't
// available it falls back to a plain new tab/window.
async function openInNewWindow(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
  const w = window as unknown as { getScreenDetails?: () => Promise<ScreenDetailsLike> };
  if (!w.getScreenDetails || !(window.screen as Screen & { isExtended?: boolean }).isExtended) return; // let the link's own target="_blank" handle it
  e.preventDefault();
  try {
    const details = await w.getScreenDetails();
    const other = details.screens.find((s) => s !== details.currentScreen);
    if (other) {
      window.open(
        href,
        "_blank",
        `noopener,noreferrer,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`
      );
      return;
    }
  } catch {
    // permission denied or unsupported — fall through
  }
  window.open(href, "_blank", "noopener,noreferrer");
}

function CopyIconButton({ label, copiedLabel, getValue }: { label: string; copiedLabel: string; getValue: () => Promise<string | null> | string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      // Safari only allows the clipboard write inside the click gesture, so
      // hand it a promise (the password is fetched from the server) instead
      // of awaiting first.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        const blob = Promise.resolve(getValue()).then((v) => new Blob([v ?? ""], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        await navigator.clipboard.writeText((await getValue()) ?? "");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — nothing useful to show
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? copiedLabel : label}
      aria-label={label}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-soft hover:bg-black/5 hover:text-ink"
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8.5l3.5 3.5L13 4.5" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
          <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
        </svg>
      )}
    </button>
  );
}

// The link / sign-in method / username / password lines of one entry, shared
// by the card view and the edit dialog's rows.
function CredentialDetails({ entry, t }: { entry: ContactCredentialRow; t: ReturnType<typeof getDict> }) {
  const href = entry.url ? safeHref(entry.url) : null;
  const method = CREDENTIAL_LOGIN_METHODS.find((m) => m.value === entry.loginMethod);

  return (
    <>
      {entry.url &&
        (href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openInNewWindow(e, href)}
            className="block truncate text-xs text-sky-700 hover:underline"
          >
            {entry.url}
          </a>
        ) : (
          <p className="truncate text-xs text-soft">{entry.url}</p>
        ))}
      {method && (
        <p className="text-xs text-soft">
          {t.contactCredentials.signsInWith} <span className="font-semibold text-ink">{method.label}</span>
        </p>
      )}
      {entry.username && (
        <p className="flex items-center gap-1 text-xs text-soft">
          <span className="min-w-0 truncate font-medium uppercase tracking-wide text-ink">{entry.username}</span>
          <CopyIconButton label={t.contactCredentials.copyUsername} copiedLabel={t.contactCredentials.copied} getValue={() => entry.username ?? ""} />
        </p>
      )}
      {entry.hasPassword && (
        <p className="flex items-center gap-1 text-xs text-soft">
          <span>••••••••</span>
          <CopyIconButton
            label={t.contactCredentials.copyPassword}
            copiedLabel={t.contactCredentials.copied}
            getValue={async () => (await revealContactCredential(entry.id)).value ?? null}
          />
        </p>
      )}
    </>
  );
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
          <CredentialDetails entry={entry} t={t} />
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
              <select name="loginMethod" defaultValue="" aria-label={t.contactCredentials.loginMethodLabel} className={`${CREDENTIAL_FIELD_CLASS} sm:col-span-2`}>
                <option value="">{t.contactCredentials.loginMethodPassword}</option>
                {CREDENTIAL_LOGIN_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t.contactCredentials.loginMethodLabel} {m.label}
                  </option>
                ))}
              </select>
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
              <CredentialDetails entry={entry} t={t} />
              {entry.notes && <p className="text-xs text-soft">{entry.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      <CredentialsDialog open={open} onClose={() => setOpen(false)} contactId={contactId} entries={entries} t={t} />
    </Card>
  );
}
