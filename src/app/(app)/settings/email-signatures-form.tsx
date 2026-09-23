"use client";

import { useState, useTransition } from "react";
import RichTextarea from "@/components/rich-textarea";
import { saveEmailSignatureAction, deleteEmailSignatureAction, type EmailSignatureRow } from "@/actions/email-signatures";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";
const LABEL_CLASS = "block text-xs font-semibold uppercase tracking-wide text-soft";

// One signature's editor — local, uncontrolled-from-the-server state
// (same pattern as email-link-fields.tsx's EmailLinkEditor) since this
// needs richer state than a plain <form action> gives: a rich-text body
// and several independent checkboxes.
function SignatureCard({
  signature,
  accounts,
  lang,
  onSaved,
  onDeleted,
}: {
  signature: EmailSignatureRow;
  accounts: { source: string; address: string }[];
  lang: Lang;
  onSaved: (row: EmailSignatureRow) => void;
  onDeleted: (id: string) => void;
}) {
  const t = getDict(lang);
  const [name, setName] = useState(signature.name);
  const [htmlEn, setHtmlEn] = useState(signature.htmlEn);
  const [htmlFr, setHtmlFr] = useState(signature.htmlFr);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(signature.accounts);
  const [useForNew, setUseForNew] = useState(signature.useForNew);
  const [useForReply, setUseForReply] = useState(signature.useForReply);
  const [useForForward, setUseForForward] = useState(signature.useForForward);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleAccount(address: string) {
    setSelectedAccounts((prev) => (prev.includes(address) ? prev.filter((a) => a !== address) : [...prev, address]));
  }

  function save() {
    startTransition(async () => {
      const result = await saveEmailSignatureAction(signature.id || null, {
        name,
        htmlEn,
        htmlFr,
        accounts: selectedAccounts,
        useForNew,
        useForReply,
        useForForward,
      });
      if (result.error || !result.id) {
        setError(result.error === "name_required" ? t.emailSignatures.nameRequired : result.error ?? t.emailSignatures.nameRequired);
        return;
      }
      setError(null);
      onSaved({ id: result.id, name, htmlEn, htmlFr, accounts: selectedAccounts, useForNew, useForReply, useForForward });
    });
  }

  function remove() {
    if (!signature.id) return;
    startTransition(async () => {
      await deleteEmailSignatureAction(signature.id);
      onDeleted(signature.id);
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-card-border bg-field-bg/40 p-3">
      <div>
        <label className={LABEL_CLASS}>{t.emailSignatures.name}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${FIELD_CLASS}`} placeholder={t.emailSignatures.namePlaceholder} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL_CLASS}>{t.emailSignatures.bodyEn}</label>
          <div className="mt-1">
            <RichTextarea value={htmlEn} onChange={setHtmlEn} className="min-h-[7rem]" />
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS}>{t.emailSignatures.bodyFr}</label>
          <div className="mt-1">
            <RichTextarea value={htmlFr} onChange={setHtmlFr} className="min-h-[7rem]" />
          </div>
        </div>
      </div>

      <div>
        <label className={LABEL_CLASS}>{t.emailSignatures.accounts}</label>
        <div className="mt-1 flex flex-wrap gap-3">
          {accounts.map((a) => (
            <label key={a.address} className="flex items-center gap-1.5 text-sm text-ink">
              <input type="checkbox" checked={selectedAccounts.includes(a.address)} onChange={() => toggleAccount(a.address)} />
              {a.address}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-soft">{selectedAccounts.length === 0 ? t.emailSignatures.allAccounts : null}</p>
      </div>

      <div>
        <label className={LABEL_CLASS}>{t.emailSignatures.usage}</label>
        <div className="mt-1 flex flex-wrap gap-3">
          <label className="flex items-center gap-1.5 text-sm text-ink">
            <input type="checkbox" checked={useForNew} onChange={(e) => setUseForNew(e.target.checked)} />
            {t.emailSignatures.useForNew}
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink">
            <input type="checkbox" checked={useForReply} onChange={(e) => setUseForReply(e.target.checked)} />
            {t.emailSignatures.useForReply}
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink">
            <input type="checkbox" checked={useForForward} onChange={(e) => setUseForForward(e.target.checked)} />
            {t.emailSignatures.useForForward}
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {signature.id && (
          <button type="button" disabled={pending} onClick={remove} className="text-sm text-red-600 hover:underline disabled:opacity-60">
            {t.emailSignatures.delete}
          </button>
        )}
        <button type="button" disabled={pending} onClick={save} className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60">
          {pending ? t.emailSignatures.saving : t.emailSignatures.save}
        </button>
      </div>
    </div>
  );
}

export default function EmailSignaturesForm({
  signatures,
  accounts,
  lang,
}: {
  signatures: EmailSignatureRow[];
  accounts: { source: string; address: string }[];
  lang: Lang;
}) {
  const t = getDict(lang);
  const [rows, setRows] = useState(signatures);
  const [drafts, setDrafts] = useState<EmailSignatureRow[]>([]);

  function addDraft() {
    setDrafts((prev) => [
      ...prev,
      { id: "", name: "", htmlEn: "", htmlFr: "", accounts: [], useForNew: false, useForReply: false, useForForward: false },
    ]);
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 && drafts.length === 0 && <p className="text-sm text-soft">{t.emailSignatures.empty}</p>}
      {rows.map((row) => (
        <SignatureCard
          key={row.id}
          signature={row}
          accounts={accounts}
          lang={lang}
          onSaved={(updated) => setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))}
          onDeleted={(id) => setRows((prev) => prev.filter((r) => r.id !== id))}
        />
      ))}
      {drafts.map((draft, i) => (
        <SignatureCard
          key={`draft-${i}`}
          signature={draft}
          accounts={accounts}
          lang={lang}
          onSaved={(created) => {
            setDrafts((prev) => prev.filter((_, idx) => idx !== i));
            setRows((prev) => [...prev, created]);
          }}
          onDeleted={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
        />
      ))}
      <button
        type="button"
        onClick={addDraft}
        className="rounded-lg border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
      >
        {t.emailSignatures.add}
      </button>
    </div>
  );
}
