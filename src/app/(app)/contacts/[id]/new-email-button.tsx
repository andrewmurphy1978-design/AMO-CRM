"use client";

import { useState } from "react";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";
import EmailComposeDialog, { type EmailComposeLabels, type EmailComposeTarget } from "../../email/email-compose-dialog";
import { buildNewComposeTarget } from "./contact-email-links";

// The Linked emails card's + button: starts a new email to this contact.
// Once sent, the message is picked up and linked to the contact by the
// existing address matching (refreshEmailInboxCache's autoLinkToContacts),
// so nothing needs linking by hand.
export default function NewEmailButton({
  email,
  defaultComposeSource,
  lang,
  intlLocale,
  hour12,
  emailComposeLabels,
  title,
}: {
  email: string | null;
  defaultComposeSource: string | null;
  lang: Lang;
  intlLocale: string;
  hour12: boolean;
  emailComposeLabels: EmailComposeLabels;
  title: string;
}) {
  const [composeTarget, setComposeTarget] = useState<EmailComposeTarget | null>(null);
  if (!email) return null;

  return (
    <>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={async () => {
          const target = await buildNewComposeTarget(email, defaultComposeSource);
          if (target) setComposeTarget(target);
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
      >
        +
      </button>
      <EmailComposeDialog
        target={composeTarget}
        onClose={() => setComposeTarget(null)}
        onSent={() => setComposeTarget(null)}
        dateLocale={getDateLocale(lang)}
        intlLocale={intlLocale}
        hour12={hour12}
        labels={emailComposeLabels}
      />
    </>
  );
}
