"use client";

import { useState } from "react";
import { format, type Locale } from "date-fns";
import { formatClockTime } from "@/lib/calendar-time";
import type { EmailDetail } from "@/actions/email-messages";
import EmailDialog, { type EmailDialogLabels, type EmailDialogTarget } from "./email/email-dialog";
import EmailComposeDialog, { type EmailComposeLabels, type EmailComposeTarget, type ComposeMode } from "./email/email-compose-dialog";

export interface LinkedEmailRow {
  id: string;
  gmailThreadId: string;
  subject: string | null;
  fromLabel: string | null;
  messageDate: string | null; // ISO
  gmailLink: string | null;
}

// The "Linked emails" card's row list, shared by the Contact and Affiliate
// Program detail pages — a Client Component (unlike the pages themselves)
// specifically so a row click can open the same Email Dialog the full
// Email page uses, rather than just deep-linking out to Gmail. A thread's
// own id doubles as its first message's id in Gmail's data model, which is
// the only message identifier this app's EmailLink rows keep (one row per
// thread, not per message) — good enough to open the dialog on the right
// conversation even if it lands on the first message rather than whichever
// one was most recent when the link was made.
export default function LinkedEmailsList({
  emailLinks,
  noLinkedEmailsLabel,
  dateLocale,
  intlLocale,
  hour12,
  emailDialogLabels,
  emailComposeLabels,
}: {
  emailLinks: LinkedEmailRow[];
  noLinkedEmailsLabel: string;
  dateLocale: Locale | undefined;
  intlLocale: string;
  hour12: boolean;
  emailDialogLabels: EmailDialogLabels;
  emailComposeLabels: EmailComposeLabels;
}) {
  const [openMessage, setOpenMessage] = useState<EmailDialogTarget | null>(null);
  const [composeTarget, setComposeTarget] = useState<EmailComposeTarget | null>(null);

  if (emailLinks.length === 0) {
    return <p className="text-sm text-soft">{noLinkedEmailsLabel}</p>;
  }

  return (
    <>
      <ul className="overflow-hidden rounded-lg border border-card-border">
        {emailLinks.map((link, i) => {
          const date = link.messageDate ? new Date(link.messageDate) : null;
          return (
            <li key={link.id} style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}>
              <button
                type="button"
                onClick={() => setOpenMessage({ id: link.gmailThreadId, link: link.gmailLink ?? "" })}
                className="flex w-full min-w-0 items-start gap-3 px-3 py-2 text-left hover:brightness-95"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{link.subject || "—"}</p>
                  <p className="truncate text-xs text-soft">{link.fromLabel}</p>
                </div>
                {date && (
                  <span className="shrink-0 whitespace-nowrap pt-0.5 text-right text-xs leading-4 text-soft">
                    {format(date, "MMM d, yyyy", { locale: dateLocale })}
                    <br />
                    {formatClockTime(date, hour12, intlLocale)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <EmailDialog
        target={openMessage}
        onClose={() => setOpenMessage(null)}
        onReply={(detail: EmailDetail, mode: ComposeMode) => {
          setOpenMessage(null);
          setComposeTarget({ message: detail, mode });
        }}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        hour12={hour12}
        labels={emailDialogLabels}
      />

      <EmailComposeDialog target={composeTarget} onClose={() => setComposeTarget(null)} onSent={() => setComposeTarget(null)} labels={emailComposeLabels} />
    </>
  );
}
