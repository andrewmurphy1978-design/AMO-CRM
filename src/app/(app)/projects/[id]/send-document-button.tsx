"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";
import EmailComposeDialog, { type EmailComposeLabels, type EmailComposeTarget } from "../../email/email-compose-dialog";
import { buildNewComposeTarget } from "../../contacts/[id]/contact-email-links";

// "Send to client": opens the usual email composer already addressed, with the
// subject and a message holding a link to the PDF. Once the email goes out the
// document is marked Sent. Only offered after the document has been approved.
export default function SendDocumentButton({
  label,
  getInfo,
  onSentAction,
  defaultComposeSource,
  lang,
  intlLocale,
  hour12,
  emailComposeLabels,
}: {
  label: string;
  getInfo: () => Promise<{ error?: string; subject?: string; html?: string; to?: string | null }>;
  onSentAction: () => Promise<void>;
  defaultComposeSource: string | null;
  lang: Lang;
  intlLocale: string;
  hour12: boolean;
  emailComposeLabels: EmailComposeLabels;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<EmailComposeTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const info = await getInfo();
      if (info.error) return setError(info.error);
      const composed = await buildNewComposeTarget(info.to ?? "", defaultComposeSource);
      if (!composed) return setError(lang === "fr" ? "Aucune boîte courriel connectée." : "No mailbox is connected.");
      composed.message.subject = info.subject ?? "";
      composed.initialHtml = info.html ?? "";
      setTarget(composed);
    });
  }

  return (
    <>
      <button type="button" onClick={open} disabled={pending} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
        {pending ? "…" : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
      <EmailComposeDialog
        target={target}
        onClose={() => setTarget(null)}
        onSent={() => {
          setTarget(null);
          startTransition(async () => {
            await onSentAction();
            router.refresh();
          });
        }}
        dateLocale={getDateLocale(lang)}
        intlLocale={intlLocale}
        hour12={hour12}
        labels={emailComposeLabels}
      />
    </>
  );
}
