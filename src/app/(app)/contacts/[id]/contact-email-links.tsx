"use client";

import { useState } from "react";
import type { Locale } from "date-fns";
import { listMailIdentitiesAction } from "@/actions/email-messages";
import type { MailSource } from "@/lib/mail/identity";
import EmailComposeDialog, { type EmailComposeLabels, type EmailComposeTarget } from "../../email/email-compose-dialog";

// The Contact Info card's email addresses — a Client Component (unlike the
// page itself) specifically so clicking one can open the same "New email"
// compose flow the Email page's own openNewCompose() button uses, prefilled
// with that address as the recipient. The sent message then gets picked up
// and linked to this contact for free by refreshEmailInboxCache's existing
// autoLinkToContacts address matching — no separate linking call needed here.
export default function ContactEmailLinks({
  emails,
  defaultComposeSource,
  dateLocale,
  intlLocale,
  hour12,
  emailComposeLabels,
}: {
  emails: string[];
  defaultComposeSource: string | null;
  dateLocale: Locale | undefined;
  intlLocale: string;
  hour12: boolean;
  emailComposeLabels: EmailComposeLabels;
}) {
  const [composeTarget, setComposeTarget] = useState<EmailComposeTarget | null>(null);

  async function openCompose(email: string) {
    try {
      const identities = await listMailIdentitiesAction();
      if (identities.length === 0) return;
      const identity = (defaultComposeSource && identities.find((id) => id.source === (defaultComposeSource as MailSource))) || identities[0];
      setComposeTarget({
        message: {
          id: "",
          threadId: "",
          subject: "",
          from: { name: identity.displayName ?? "", email: identity.accountAddress },
          to: [email],
          cc: [],
          date: null,
          html: null,
          text: null,
          attachments: [],
          messageIdHeader: null,
          references: [],
          replyIdentity: identity,
          deliveredTo: identity.accountAddress,
          availableIdentities: identities,
        },
        mode: "new",
      });
    } catch {
      // Best-effort, same as the Email page's own openNewCompose — a failed
      // identity lookup just leaves the click a no-op.
    }
  }

  return (
    <>
      {emails.map((email) => (
        <p key={email} className="break-words">
          <button type="button" onClick={() => openCompose(email)} className="text-left hover:underline">
            {email}
          </button>
        </p>
      ))}

      <EmailComposeDialog
        target={composeTarget}
        onClose={() => setComposeTarget(null)}
        onSent={() => setComposeTarget(null)}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        hour12={hour12}
        labels={emailComposeLabels}
      />
    </>
  );
}
