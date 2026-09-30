"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { formatClockTime } from "@/lib/calendar-time";
import type { Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { EmailDetail } from "@/actions/email-messages";
import EmailDialog, { type EmailDialogLabels, type EmailDialogTarget } from "./email/email-dialog";
import type { EmailLinkConfig, EmailLinkTarget } from "./email/email-link-fields";
import type { LinkOption, LinkDialogLabels, LinkValues } from "./link-dialog";
import EmailComposeDialog, { type EmailComposeLabels, type EmailComposeTarget, type ComposeMode } from "./email/email-compose-dialog";
import { colorForAddress, resolveEmailAddressColor, type EmailAddressColorEntry } from "@/lib/email-address-match";

export interface LinkedEmailRow {
  id: string;
  gmailThreadId: string;
  subject: string | null;
  fromLabel: string | null;
  messageDate: string | null; // ISO
  gmailLink: string | null;
  myAddress: string | null;
  // Which CRM records the thread is linked to — lets the Email dialog show
  // (and edit) its "Linked to" section.
  contactId?: string | null;
  projectId?: string | null;
  phaseId?: string | null;
  taskId?: string | null;
  affiliateProgramId?: string | null;
}

export interface LinkedEmailsLinkOptions {
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  phases?: LinkOption[];
  programs: LinkOption[];
  labels: LinkDialogLabels;
}

// The "Linked emails" card's row list, shared by the Contact and Affiliate
// Program detail pages — a Client Component (unlike the pages themselves)
// specifically so a row click can open the same Email Dialog the full
// Email page uses, rather than just deep-linking out to Gmail. EmailLink
// rows only keep a Gmail thread id (one row per thread, not per message —
// see saveEmailLink), and a thread's id does NOT reliably double as one of
// its real message ids, so the dialog target is the thread id and
// fetchOriginal (email-messages.ts) resolves it to an actual message id
// server-side before fetching.
export default function LinkedEmailsList({
  emailLinks,
  addressColors,
  noLinkedEmailsLabel,
  lang,
  intlLocale,
  hour12,
  emailDialogLabels,
  emailComposeLabels,
  linkOptions,
}: {
  emailLinks: LinkedEmailRow[];
  addressColors: EmailAddressColorEntry[];
  noLinkedEmailsLabel: string;
  // Resolved here (client-side) from `lang` rather than taken as a raw
  // date-fns Locale prop — a Locale carries function values, which can't
  // cross the Server->Client boundary when this is rendered from a Server
  // Component detail page.
  lang: Lang;
  intlLocale: string;
  hour12: boolean;
  emailDialogLabels: EmailDialogLabels;
  emailComposeLabels: EmailComposeLabels;
  // When given, the Email dialog opened from a row gets its "Linked to"
  // section (and can re-link the thread); without it that section is hidden.
  linkOptions?: LinkedEmailsLinkOptions;
}) {
  const noSubjectLabel = lang === "fr" ? "(Sans objet)" : "(No subject)";
  const noSubjectHint = lang === "fr" ? "Cliquez pour charger les détails" : "Click to load details";
  const dateLocale = getDateLocale(lang);
  const router = useRouter();
  const [openMessage, setOpenMessage] = useState<EmailDialogTarget | null>(null);
  const [composeTarget, setComposeTarget] = useState<EmailComposeTarget | null>(null);

  function currentLinkFor(values: LinkValues): EmailLinkTarget | null {
    if (!linkOptions) return null;
    const nameOf = (list: LinkOption[] | undefined, id: string | undefined) => (id ? list?.find((o) => o.id === id)?.label : undefined);
    // Everything it's linked to, in order (contact › project › phase › task ›
    // program): the first is the main link, the rest are shown after it.
    const chain: { name: string; href: string }[] = [];
    const contact = nameOf(linkOptions.contacts, values.contactId);
    const project = nameOf(linkOptions.projects, values.projectId);
    const phase = nameOf(linkOptions.phases, values.phaseId);
    const task = nameOf(linkOptions.tasks, values.taskId);
    const program = nameOf(linkOptions.programs, values.affiliateProgramId);
    if (contact) chain.push({ name: contact, href: `/contacts/${values.contactId}` });
    if (project) chain.push({ name: project, href: `/projects/${values.projectId}` });
    if (phase) chain.push({ name: phase, href: `/projects/${values.projectId}` });
    if (task) chain.push({ name: task, href: `/projects/${values.projectId}/tasks/${values.taskId}/edit` });
    if (program) chain.push({ name: program, href: `/marketing#${values.affiliateProgramId}` });
    return chain.length > 0 ? { ...chain[0], also: chain.slice(1) } : null;
  }

  function buildLinkConfig(link: LinkedEmailRow): EmailLinkConfig | undefined {
    if (!linkOptions) return undefined;
    const initial: LinkValues = {
      contactId: link.contactId ?? "",
      projectId: link.projectId ?? "",
      taskId: link.taskId ?? "",
      phaseId: link.phaseId ?? "",
      bookingId: "",
      affiliateProgramId: link.affiliateProgramId ?? "",
    };
    return {
      threadId: link.gmailThreadId,
      subject: link.subject ?? "",
      fromLabel: link.fromLabel ?? "",
      date: link.messageDate ?? new Date().toISOString(),
      link: link.gmailLink ?? "",
      myAddress: link.myAddress,
      contacts: linkOptions.contacts,
      projects: linkOptions.projects,
      tasks: linkOptions.tasks,
      phases: linkOptions.phases,
      programs: linkOptions.programs,
      initial,
      current: currentLinkFor(initial),
      labels: linkOptions.labels,
      onSaved: (values) => {
        const current = currentLinkFor(values);
        setOpenMessage((prev) =>
          prev && prev.linkConfig?.threadId === link.gmailThreadId ? { ...prev, linkConfig: { ...prev.linkConfig, current, initial: values } } : prev
        );
        // A row re-linked away from this page's record should drop out of
        // the list — the server re-renders it.
        router.refresh();
      },
    };
  }

  if (emailLinks.length === 0) {
    return <p className="text-sm text-soft">{noLinkedEmailsLabel}</p>;
  }

  return (
    <>
      <ul className="max-h-[520px] overflow-y-auto overflow-x-hidden rounded-lg border border-card-border">
        {emailLinks.map((link, i) => {
          const date = link.messageDate ? new Date(link.messageDate) : null;
          const dotColor = colorForAddress(link.myAddress, addressColors);
          return (
            <li key={link.id} style={{ backgroundColor: i % 2 === 0 ? "#fdf4ff" : "#fae8ff" }}>
              <button
                type="button"
                onClick={() => setOpenMessage({ id: link.gmailThreadId, link: link.gmailLink ?? "", dotColor, linkConfig: buildLinkConfig(link) })}
                className="flex w-full min-w-0 items-start gap-3 px-3 py-2 text-left hover:brightness-95"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{link.subject || noSubjectLabel}</p>
                  <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-soft">
                    {dotColor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} title={link.myAddress ?? undefined} />}
                    <span className="truncate">{link.fromLabel || (link.subject ? "" : noSubjectHint)}</span>
                  </p>
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
          const replyLinkConfig = openMessage?.linkConfig;
          setOpenMessage(null);
          const dotColor = resolveEmailAddressColor(
            { deliveredTo: detail.deliveredTo, toRaw: [...detail.to, ...detail.cc].join(", ") },
            addressColors
          );
          setComposeTarget({ message: detail, mode, dotColor, linkConfig: replyLinkConfig });
        }}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        hour12={hour12}
        labels={emailDialogLabels}
      />

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
