"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "@/lib/clsx";
import RefreshButton from "./refresh-button";
import { isOwnDomainEmail } from "@/lib/email-domain";
import { isStale } from "@/lib/staleness";
import {
  resolveEmailAddressColor,
  colorForAddress,
  primaryReceivedAddress,
  type EmailAddressColorEntry,
} from "@/lib/email-address-match";
import type { EmailSummary, SentEmailSummary } from "@/lib/google";
import type { EmailScreeningPayload, EmailLinkInfo } from "@/lib/email-inbox";
import { EMAIL_SECTION_COLORS } from "./email-section-colors";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getDict } from "@/lib/i18n/dictionaries";
import type { EmailDetail } from "@/actions/email-messages";
import {
  fetchDraftsAction,
  fetchDraftDetailAction,
  type DraftRow,
} from "@/actions/email-drafts";
import EmailDialog, { type EmailDialogTarget } from "./email/email-dialog";
import EmailComposeDialog, {
  type EmailComposeTarget,
  type ComposeMode,
} from "./email/email-compose-dialog";
import type { EmailLinkConfig } from "./email/email-link-fields";
import type { LinkOption, LinkValues } from "./link-dialog";

export interface EmailLabels {
  title: string;
  refresh: string;
  refreshing: string;
  screening: string;
  notConnected: string;
  connectInSettings: string;
  noItems: string;
  categoryNeedsReply: string;
  categoryNeedsAttention: string;
  awaitingResponse: string;
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      className={clsx("animate-spin", className)}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

// "3:15 PM" for something received today, "Sep 12, 3:15 PM" otherwise —
// matches the user's own 24h/12h preference (see the Date/Time card and
// Calendar) rather than a locale default.
function formatEmailDate(
  iso: string,
  hour12: boolean,
  intlLocale: string,
): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(intlLocale, {
    hour: "numeric",
    minute: "2-digit",
    hour12,
  }).format(date);
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = new Intl.DateTimeFormat(intlLocale, {
    month: "short",
    day: "numeric",
  }).format(date);
  return `${day}, ${time}`;
}

function postJson(url: string, id: string): void {
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  }).catch(() => {});
}

export default function EmailCard({
  initialData,
  connected,
  hour12,
  lang,
  addressColors,
  contactOptions,
  projectOptions,
  taskOptions,
  programOptions,
  labels,
}: {
  initialData: EmailScreeningPayload | null;
  connected: boolean;
  hour12: boolean;
  lang: "en" | "fr";
  addressColors: EmailAddressColorEntry[];
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  programOptions: LinkOption[];
  labels: EmailLabels;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  // No cache yet on the very first-ever visit — start "loading" so the
  // effect below can kick off the initial screen without a synchronous
  // setState call of its own (the fetch's first `await` already defers
  // past that) — same shape as the Email page's own cold-start effect.
  const [loading, setLoading] = useState(
    () => connected && (!initialData || isStale(initialData.fetchedAt)),
  );
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [completedOverrides, setCompletedOverrides] = useState<
    Record<string, string | null>
  >({});
  const [openMessage, setOpenMessage] = useState<EmailDialogTarget | null>(
    null,
  );
  const [composeTarget, setComposeTarget] = useState<EmailComposeTarget | null>(
    null,
  );
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";
  const dateLocale = getDateLocale(lang);
  const t = getDict(lang);

  const linkLabels = {
    link: t.linkPicker.link,
    edit: t.linkPicker.edit,
    none: t.linkPicker.none,
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    affiliateProgram: t.linkPicker.affiliateProgram,
    save: t.linkPicker.save,
    saving: t.linkPicker.saving,
    cancel: t.linkPicker.cancel,
    clear: t.linkPicker.clear,
    title: t.linkPicker.titleWithAffiliateProgram,
    searchPlaceholder: t.linkPicker.searchPlaceholder,
    noResults: t.linkPicker.noResults,
  };

  async function runScreening() {
    try {
      const res = await fetch("/api/email/inbox", { method: "POST" });
      if (res.ok) {
        setData((await res.json()) as EmailScreeningPayload);
        setReadOverrides({});
      }
    } catch {
      // Keep showing the last known data rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    await runScreening();
  }

  useEffect(() => {
    // Runs once on mount: either there's no cache yet, or what's cached is
    // older than the 15-minute stale window (see @/lib/staleness).
    if (connected && (!initialData || isStale(initialData.fetchedAt))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      runScreening();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Same "Drafts awaiting approval" category the Email page shows — a
    // draft is never part of the cached inbox snapshot (Gmail's Drafts
    // folder is a live call of its own), so this always fetches fresh on
    // mount rather than reading it off `data`.
    if (!connected) return;
    fetchDraftsAction()
      .then(setDrafts)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markRead(id: string) {
    setReadOverrides((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    postJson("/api/email/mark-read", id);
  }

  function markComplete(id: string) {
    setCompletedOverrides((prev) =>
      prev[id] ? prev : { ...prev, [id]: new Date().toISOString() },
    );
    postJson("/api/email/mark-complete", id);
  }

  // Same reconstruction the Email page's own valuesToLinkInfo does — the
  // option lists' own labels stand in for the real DB row's names so the
  // dialog's "Linked to" line updates instantly, without waiting on a
  // refetch.
  function valuesToLinkInfo(values: LinkValues): EmailLinkInfo {
    const contact = contactOptions.find((c) => c.id === values.contactId);
    const project = projectOptions.find((p) => p.id === values.projectId);
    const task = taskOptions.find((tk) => tk.id === values.taskId);
    const program = programOptions.find(
      (p) => p.id === values.affiliateProgramId,
    );
    return {
      contactId: values.contactId,
      projectId: values.projectId,
      taskId: values.taskId,
      affiliateProgramId: values.affiliateProgramId,
      contactName: contact?.label ?? "",
      projectName: project?.label ?? "",
      taskName: task?.label ?? "",
      affiliateProgramName: program?.label ?? "",
      linkedAt: new Date().toISOString(),
    };
  }

  function linkedTo(
    link: EmailLinkInfo | undefined,
  ): { name: string; href: string } | null {
    if (!link) return null;
    if (link.contactName)
      return { name: link.contactName, href: `/contacts/${link.contactId}` };
    if (link.projectName)
      return { name: link.projectName, href: `/projects/${link.projectId}` };
    if (link.affiliateProgramName)
      return {
        name: link.affiliateProgramName,
        href: `/marketing#${link.affiliateProgramId}`,
      };
    if (link.taskName)
      return {
        name: link.taskName,
        href: `/projects/${link.projectId}/tasks/${link.taskId}/edit`,
      };
    return null;
  }

  function applyLinkSave(threadId: string, values: LinkValues) {
    const info = valuesToLinkInfo(values);
    setData((prev) =>
      prev
        ? {
            ...prev,
            linksByThread: { ...prev.linksByThread, [threadId]: info },
          }
        : prev,
    );
    const current = linkedTo(info);
    setOpenMessage((prev) =>
      prev && prev.linkConfig?.threadId === threadId
        ? {
            ...prev,
            linkConfig: { ...prev.linkConfig, current, initial: values },
          }
        : prev,
    );
    setComposeTarget((prev) =>
      prev && prev.linkConfig?.threadId === threadId
        ? {
            ...prev,
            linkConfig: { ...prev.linkConfig, current, initial: values },
          }
        : prev,
    );
  }

  // Same shape the Email page's own dialogs build — the "Linked to"
  // contact/project/task/program picker, so a message links identically
  // whether opened from here or from the Email page itself.
  function buildLinkConfig(
    threadId: string,
    subject: string,
    fromLabel: string,
    dateIso: string,
    link: string,
    myAddress: string | null,
  ): EmailLinkConfig {
    const info = data?.linksByThread[threadId];
    return {
      threadId,
      subject,
      fromLabel,
      date: dateIso,
      link,
      myAddress,
      contacts: contactOptions,
      projects: projectOptions,
      tasks: taskOptions,
      programs: programOptions,
      initial: {
        contactId: info?.contactId ?? "",
        projectId: info?.projectId ?? "",
        taskId: info?.taskId ?? "",
        bookingId: "",
        affiliateProgramId: info?.affiliateProgramId ?? "",
      },
      current: linkedTo(info),
      labels: linkLabels,
      onSaved: (values) => applyLinkSave(threadId, values),
    };
  }

  function composeTargetFrom(
    message: EmailDetail,
    mode: ComposeMode,
  ): EmailComposeTarget {
    const toRaw = [...message.to, ...message.cc].join(", ");
    const emailLike = { deliveredTo: message.deliveredTo, toRaw };
    const dateIso = message.date ?? new Date().toISOString();
    const link = `https://mail.google.com/mail/u/0/#inbox/${message.threadId}`;
    return {
      message,
      mode,
      dotColor: resolveEmailAddressColor(emailLike, addressColors),
      linkConfig: buildLinkConfig(
        message.threadId,
        message.subject,
        message.from.name || message.from.email,
        dateIso,
        link,
        primaryReceivedAddress(emailLike),
      ),
    };
  }

  // Same shape the Email page's own openDraft builds — a draft has no
  // established thread yet, so (unlike a reply/forward) this never gets a
  // linkConfig, exactly like the Email page's own version.
  async function openDraft(draft: DraftRow) {
    const result = await fetchDraftDetailAction(draft.id);
    if ("error" in result) return;
    const dotColor = colorForAddress(result.fromAddress, addressColors);
    setComposeTarget({
      message: {
        id: draft.id,
        threadId: result.threadId,
        subject: result.subject,
        from: { name: "", email: result.fromAddress },
        to: result.to,
        cc: result.cc,
        date: null,
        html: result.html,
        text: result.text,
        attachments: [],
        messageIdHeader: null,
        references: [],
        replyIdentity: {
          source: result.source,
          accountAddress: result.fromAddress,
          displayName: null,
        },
        deliveredTo: result.fromAddress,
        availableIdentities: [
          {
            source: result.source,
            accountAddress: result.fromAddress,
            displayName: null,
          },
        ],
      },
      mode: "draft",
      dotColor,
      draft: { id: draft.id, source: draft.source },
    });
  }

  const isRead = (id: string): boolean =>
    readOverrides[id] || Boolean(data?.readStates[id]);
  const isCompleted = (id: string): boolean => {
    const override = completedOverrides[id];
    return override !== undefined
      ? override !== null
      : Boolean(data?.completions[id]);
  };
  const emails = data?.emails ?? [];
  // Only threads still genuinely awaiting a reply — sentAwaitingReply now
  // also carries ones Gmail shows a reply has arrived on (so the Email
  // page can list them under Completed), which don't belong in this card.
  const awaitingSent = (data?.sentAwaitingReply ?? []).filter(
    (s) => s.status === "awaiting" && !isCompleted(s.id),
  );
  const needsReply = emails.filter(
    (e) =>
      !isCompleted(e.id) &&
      !isRead(e.id) &&
      data?.classifications[e.id] === "NEEDS_REPLY",
  );
  const needsAttention = emails.filter(
    (e) =>
      !isCompleted(e.id) &&
      !isRead(e.id) &&
      data?.classifications[e.id] === "NEEDS_ATTENTION",
  );
  const nothingToShow =
    drafts.length === 0 &&
    needsReply.length === 0 &&
    awaitingSent.length === 0 &&
    needsAttention.length === 0;

  // Name/Object stacked (Object smaller, right below) plus the date on
  // the right — clicking a row opens the same Email View Dialog the Email
  // page itself opens, instead of deep-linking out to Gmail.
  function emailRow(email: EmailSummary, i: number) {
    const dotColor = resolveEmailAddressColor(email, addressColors);
    return (
      <li key={email.id}>
        <button
          type="button"
          onClick={() => {
            markRead(email.id);
            setOpenMessage({
              id: email.id,
              link: email.link,
              dotColor,
              linkConfig: buildLinkConfig(
                email.threadId,
                email.subject,
                email.from,
                email.date,
                email.link,
                primaryReceivedAddress(email),
              ),
            });
          }}
          className={`flex w-full min-w-0 items-start gap-2 px-2 py-1.5 text-left hover:opacity-80 ${
            isOwnDomainEmail(email.fromEmail)
              ? "bg-amo-gold/20"
              : i % 2 === 1
                ? "bg-black/[0.03]"
                : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">
              {email.from}
            </p>
            <p className="truncate text-xs text-soft">{email.subject}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">
            {formatEmailDate(email.date, hour12, intlLocale)}
          </span>
        </button>
      </li>
    );
  }

  function sentRow(item: SentEmailSummary, i: number) {
    const dotColor = colorForAddress(item.fromEmail, addressColors);
    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() =>
            setOpenMessage({
              id: item.id,
              link: item.link,
              dotColor,
              linkConfig: buildLinkConfig(
                item.threadId,
                item.subject,
                item.to,
                item.date,
                item.link,
                item.fromEmail ?? null,
              ),
            })
          }
          className={`flex w-full min-w-0 items-start gap-2 px-2 py-1.5 text-left hover:opacity-80 ${i % 2 === 1 ? "bg-black/[0.03]" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{item.to}</p>
            <p className="truncate text-xs text-soft">{item.subject}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">
            {formatEmailDate(item.date, hour12, intlLocale)}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg p-2 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      {/* No more a header "Open Emails" button — clicking anywhere on the
          card that isn't a row or the Refresh button now does the same
          thing (see the outer onClick below). `display:contents` keeps
          this purely an event boundary, not a layout box: it sits inside
          the flex column exactly as if this div weren't here at all. The
          two dialogs are deliberately rendered as this div's *siblings*
          (outside it), so a click inside either of them never bubbles up
          into this card's own "go to /email" handler. */}
      <div
        role="button"
        tabIndex={connected ? 0 : -1}
        onClick={() => connected && router.push("/email")}
        onKeyDown={(e) => {
          if (connected && (e.key === "Enter" || e.key === " "))
            router.push("/email");
        }}
        className={clsx("contents", connected && "cursor-pointer")}
      >
        <div className="relative flex shrink-0 items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-ink">
            {labels.title}
          </h2>
          {connected && (
            <div onClick={(e) => e.stopPropagation()}>
              <RefreshButton
                onClick={refresh}
                loading={loading}
                label={labels.refresh}
                loadingLabel={labels.refreshing}
                hideLabelOnMobile
              />
            </div>
          )}
        </div>

        {!connected ? (
          <p className="mt-3 text-sm text-soft">
            {labels.notConnected}{" "}
            <Link
              href="/settings"
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-emerald-700 underline"
            >
              {labels.connectInSettings}
            </Link>
          </p>
        ) : loading && !data ? (
          <div className="mt-3 flex items-center justify-center gap-2 py-6 text-sm text-soft">
            <Spinner className="h-5 w-5" />
            {labels.screening}
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {nothingToShow && (
              <p className="text-sm text-soft">{labels.noItems}</p>
            )}

            {drafts.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-card-border">
                <div
                  className={`flex items-center gap-2 px-3 py-2 ${EMAIL_SECTION_COLORS.DRAFTS.headerBg}`}
                >
                  <h3
                    className={`text-xs font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.DRAFTS.headerText}`}
                  >
                    {t.email.draftsTitle}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_SECTION_COLORS.DRAFTS.badgeBg} ${EMAIL_SECTION_COLORS.DRAFTS.badgeText}`}
                  >
                    {drafts.length}
                  </span>
                </div>
                <ul className="bg-card-bg" onClick={(e) => e.stopPropagation()}>
                  {drafts.map((draft, i) => (
                    <li key={draft.id}>
                      <button
                        type="button"
                        onClick={() => openDraft(draft)}
                        className={`flex w-full min-w-0 items-start gap-2 px-2 py-1.5 text-left hover:opacity-80 ${i % 2 === 1 ? "bg-black/[0.03]" : ""}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {draft.to || t.email.draftNoRecipient}
                          </p>
                          {draft.subject && (
                            <p className="truncate text-xs text-soft">
                              {draft.subject}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">
                          {formatEmailDate(draft.date, hour12, intlLocale)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {needsReply.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-card-border">
                <div
                  className={`flex items-center gap-2 px-3 py-2 ${EMAIL_SECTION_COLORS.NEEDS_REPLY.headerBg}`}
                >
                  <h3
                    className={`text-xs font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.NEEDS_REPLY.headerText}`}
                  >
                    {labels.categoryNeedsReply}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_SECTION_COLORS.NEEDS_REPLY.badgeBg} ${EMAIL_SECTION_COLORS.NEEDS_REPLY.badgeText}`}
                  >
                    {needsReply.length}
                  </span>
                </div>
                <ul className="bg-card-bg" onClick={(e) => e.stopPropagation()}>
                  {needsReply.map((e, i) => emailRow(e, i))}
                </ul>
              </section>
            )}

            {awaitingSent.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-card-border">
                <div
                  className={`flex items-center gap-2 px-3 py-2 ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.headerBg}`}
                >
                  <h3
                    className={`text-xs font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.headerText}`}
                  >
                    {labels.awaitingResponse}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.badgeBg} ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.badgeText}`}
                  >
                    {awaitingSent.length}
                  </span>
                </div>
                <ul className="bg-card-bg" onClick={(e) => e.stopPropagation()}>
                  {awaitingSent.map((s, i) => sentRow(s, i))}
                </ul>
              </section>
            )}

            {needsAttention.length > 0 && (
              <section className="overflow-hidden rounded-xl border border-card-border">
                <div
                  className={`flex items-center gap-2 px-3 py-2 ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.headerBg}`}
                >
                  <h3
                    className={`text-xs font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.headerText}`}
                  >
                    {labels.categoryNeedsAttention}
                  </h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.badgeBg} ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.badgeText}`}
                  >
                    {needsAttention.length}
                  </span>
                </div>
                <ul className="bg-card-bg" onClick={(e) => e.stopPropagation()}>
                  {needsAttention.map((e, i) => emailRow(e, i))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <EmailDialog
        target={openMessage}
        onClose={() => setOpenMessage(null)}
        onReply={(detail, mode) => {
          setOpenMessage(null);
          setComposeTarget(composeTargetFrom(detail, mode));
        }}
        onComplete={
          openMessage
            ? () => {
                markComplete(openMessage.id);
                setOpenMessage(null);
              }
            : undefined
        }
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        hour12={hour12}
        labels={t.emailDialog}
      />

      <EmailComposeDialog
        target={composeTarget}
        onClose={() => setComposeTarget(null)}
        onSent={() => setComposeTarget(null)}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        hour12={hour12}
        labels={t.emailCompose}
      />
    </div>
  );
}
