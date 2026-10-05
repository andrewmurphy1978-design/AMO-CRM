"use client";

import { useEffect, useState } from "react";
import { addContactEmail, listContactEmails } from "@/actions/contact-emails";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD =
  "mt-1 w-full min-w-0 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const OTHER = "__other__";

// "Email to use for subscriptions": pick one of the contact's emails or type a new one. A new
// address asks whether it should be added to the contact's emails. Posts `subscriptionEmail`.
export default function SubscriptionEmailField({ contactId, defaultValue, lang }: { contactId: string; defaultValue: string; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const [emails, setEmails] = useState<string[]>([]);
  const [value, setValue] = useState(defaultValue);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [ask, setAsk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    if (contactId) void listContactEmails(contactId).then((list) => live && setEmails(list)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [contactId]);

  // A typed address that is not on the contact yet.
  function commitDraft() {
    const mail = draft.trim();
    if (!mail) return;
    if (!EMAIL_RE.test(mail)) return;
    setValue(mail);
    if (!emails.some((e) => e.toLowerCase() === mail.toLowerCase()) && contactId) setAsk(mail);
    else setTyping(false);
  }

  const options = value && !emails.includes(value) ? [value, ...emails] : emails;

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{fr ? "Courriel à utiliser pour les abonnements" : "Email to use for subscriptions"}</label>
      <input type="hidden" name="subscriptionEmail" value={value} />
      {typing ? (
        <div className="flex gap-2">
          <input
            autoFocus
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
            }}
            onBlur={commitDraft}
            placeholder={fr ? "nouveau@courriel.com" : "new@email.com"}
            className={FIELD}
          />
          <button type="button" onClick={() => setTyping(false)} className="mt-1 rounded-md border border-card-border px-2 text-xs text-soft hover:text-ink">
            {fr ? "Annuler" : "Cancel"}
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setDraft("");
              setTyping(true);
            } else setValue(e.target.value);
          }}
          className={FIELD}
        >
          <option value="">{fr ? "— Aucun —" : "— None —"}</option>
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value={OTHER}>{fr ? "Autre… (écrire un nouveau courriel)" : "Other… (type a new email)"}</option>
        </select>
      )}

      {ask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-5 shadow-xl" role="dialog" aria-modal="true">
            <h3 className="font-display text-base font-semibold text-ink">{fr ? "Nouveau courriel" : "New email address"}</h3>
            <p className="mt-2 text-sm text-ink">
              {fr ? `Ajouter ${ask} aux courriels du contact ?` : `Add ${ask} to the contact's emails?`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAsk(null);
                  setTyping(false);
                }}
                className="rounded-md border border-card-border px-3 py-1.5 text-sm text-ink hover:bg-black/5"
              >
                {fr ? "Non, seulement ici" : "No, only here"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await addContactEmail(contactId, ask);
                  setEmails((list) => (list.includes(ask) ? list : [...list, ask]));
                  setBusy(false);
                  setAsk(null);
                  setTyping(false);
                }}
                className="btn-primary rounded-md px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
              >
                {fr ? "Oui, l'ajouter" : "Yes, add it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
