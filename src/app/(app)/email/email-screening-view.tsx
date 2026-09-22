"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Locale } from "date-fns";
import clsx from "@/lib/clsx";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { isOwnDomainEmail } from "@/lib/email-domain";
import { isStale } from "@/lib/staleness";
import type { EmailSummary } from "@/lib/google";
import type { EmailCategory } from "@/lib/email-classifier";
import type { EmailLinkInfo, EmailScreeningPayload } from "@/lib/email-inbox";
import PageHeader from "../page-header";
import RefreshButton from "../refresh-button";
import EmailLinkPicker, { type LinkOption } from "./email-link-picker";
import EmailTime from "./email-time";
import EmailQuickActions from "../email-quick-actions";
import type { LinkValues, LinkDialogLabels } from "../link-dialog";

export type { EmailScreeningPayload };

const CATEGORY_ORDER: EmailCategory[] = ["NEEDS_REPLY", "NEEDS_ATTENTION", "CAN_WAIT", "LOW_PRIORITY"];
// Once opened, a message stays in "Recently read" for a week (in case it
// still needs linking to a client/project/task), then drops out of view —
// sooner if it gets linked before that.
const RECENTLY_READ_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// One accent color per section, keyed by the same `key` used to build
// orderedSections below — the whole card header (not just a thin bar) uses
// the category color, with the row list underneath kept plain so the
// messages themselves always look the same regardless of category.
const SECTION_COLORS: Record<string, { headerBg: string; headerText: string; badgeBg: string; badgeText: string }> = {
  NEEDS_REPLY: { headerBg: "bg-rose-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  SENT_AWAITING_REPLY: { headerBg: "bg-amber-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  NEEDS_ATTENTION: { headerBg: "bg-blue-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  CAN_WAIT: { headerBg: "bg-violet-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  LOW_PRIORITY: { headerBg: "bg-slate-300", headerText: "text-slate-800", badgeBg: "bg-white/60", badgeText: "text-slate-800" },
  RECENTLY_READ: { headerBg: "bg-gray-200", headerText: "text-gray-700", badgeBg: "bg-white/70", badgeText: "text-gray-700" },
  COMPLETED: { headerBg: "bg-emerald-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
};

function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className={clsx("animate-spin", className)}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
      />
    </svg>
  );
}

function AttachmentIcon({ className, title }: { className?: string; title: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <title>{title}</title>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94a3 3 0 1 1 4.243 4.242L9.564 17.31a1.5 1.5 0 0 1-2.122-2.12l8.485-8.486"
      />
    </svg>
  );
}

function ImportantIcon({ className, title }: { className?: string; title: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <title>{title}</title>
      <path
        fillRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1 1 0 0 1 1 1v4.5a1 1 0 1 1-2 0V8a1 1 0 0 1 1-1Zm0 9.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CompleteButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="shrink-0 rounded p-1 text-emerald-600 hover:bg-emerald-600/10 hover:text-emerald-700"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75 10 18l9.5-12" />
      </svg>
    </button>
  );
}

// The Completed section's own check — filled (white check on a solid
// green background) instead of the plain outline used to mark something
// done, so it reads as "this is done, click to undo" rather than as
// another "mark done" prompt.
function UncompleteButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="shrink-0 rounded bg-emerald-600 p-1 text-white hover:bg-emerald-700"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75 10 18l9.5-12" />
      </svg>
    </button>
  );
}

// The Recently Read section's "put it back" action — reopens the message
// into whichever category it was in before it was opened.
function MarkUnreadButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className="shrink-0 rounded p-1 text-soft hover:bg-black/10 hover:text-ink">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 17.25V6.75Zm0 0 9.75 6.75 9.75-6.75"
        />
      </svg>
    </button>
  );
}

// Fixed widths on every column after the subject (linked-to name, link
// icon, complete icon, quick actions, date) are what keep icons lined up
// between rows — a variable-width date string ("19:58" vs "Sep 12, 3:15
// PM") was previously the last flex child, so its own width change shifted
// where every fixed-width icon before it landed.
const LINKED_TO_WIDTH = "w-28";
const DATE_WIDTH = "w-24";

function EmailRow({
  index,
  highlight,
  primaryLabel,
  subject,
  hasAttachments,
  important,
  attachmentLabel,
  importantLabel,
  link,
  threadId,
  linkInfo,
  linkSummaryText,
  linkedTo,
  contactOptions,
  projectOptions,
  taskOptions,
  programOptions,
  linkLabels,
  quickActionLabels,
  dateIso,
  hour12,
  intlLocale,
  onOpen,
  onLinkSaved,
  onComplete,
  onUncomplete,
  onMarkUnread,
  completeLabel,
  uncompleteLabel,
  markUnreadLabel,
}: {
  index: number;
  highlight: boolean;
  primaryLabel: string;
  subject: string;
  hasAttachments?: boolean;
  important?: boolean;
  attachmentLabel: string;
  importantLabel: string;
  link: string;
  threadId: string;
  linkInfo: EmailLinkInfo | undefined;
  linkSummaryText: string | null;
  linkedTo: { name: string; href: string } | null;
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  programOptions: LinkOption[];
  linkLabels: LinkDialogLabels;
  quickActionLabels: { reply: string; replyAll: string; forward: string };
  dateIso: string;
  hour12: boolean;
  intlLocale: string;
  onOpen?: () => void;
  onLinkSaved: (values: LinkValues) => void;
  onComplete?: () => void;
  onUncomplete?: () => void;
  onMarkUnread?: () => void;
  completeLabel: string;
  uncompleteLabel: string;
  markUnreadLabel: string;
}) {
  return (
    <li className={clsx("transition-colors hover:bg-black/5", highlight ? "bg-amo-gold/20" : index % 2 === 1 ? "bg-black/[0.03]" : "")}>
      <div className="flex items-center gap-3 px-4 py-1.5">
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          className="w-40 shrink-0 truncate text-sm font-medium text-ink hover:opacity-80"
        >
          {primaryLabel}
        </a>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-1 truncate text-sm text-soft hover:opacity-80"
        >
          {hasAttachments && <AttachmentIcon className="h-3.5 w-3.5 shrink-0" title={attachmentLabel} />}
          {important && <ImportantIcon className="h-3.5 w-3.5 shrink-0 text-red-600" title={importantLabel} />}
          <span className="truncate">{subject}</span>
        </a>
        <span className={`${LINKED_TO_WIDTH} shrink-0 truncate text-right text-xs font-medium`}>
          {linkedTo && (
            <Link href={linkedTo.href} className="text-emerald-700 hover:underline">
              {linkedTo.name}
            </Link>
          )}
        </span>
        <EmailLinkPicker
          threadId={threadId}
          subject={subject}
          fromLabel={primaryLabel}
          date={dateIso}
          link={link}
          contacts={contactOptions}
          projects={projectOptions}
          tasks={taskOptions}
          programs={programOptions}
          initialContactId={linkInfo?.contactId ?? ""}
          initialProjectId={linkInfo?.projectId ?? ""}
          initialTaskId={linkInfo?.taskId ?? ""}
          initialProgramId={linkInfo?.affiliateProgramId ?? ""}
          summary={linkSummaryText}
          labels={linkLabels}
          onSaved={onLinkSaved}
        />
        {/* Fixed-width slots even when a given row has no action there (e.g.
            the Completed section has no Complete button of its own, and
            only Recently Read has an unread button) — otherwise the icons
            after them would shift between sections. */}
        <span className="flex w-6 shrink-0 justify-center">
          {onComplete && <CompleteButton onClick={onComplete} title={completeLabel} />}
          {onUncomplete && <UncompleteButton onClick={onUncomplete} title={uncompleteLabel} />}
        </span>
        <span className="flex w-6 shrink-0 justify-center">{onMarkUnread && <MarkUnreadButton onClick={onMarkUnread} title={markUnreadLabel} />}</span>
        <EmailQuickActions link={link} labels={quickActionLabels} onOpen={onOpen} />
        <span className={`${DATE_WIDTH} shrink-0 whitespace-nowrap text-right text-xs text-soft`}>
          <EmailTime iso={dateIso} hour12={hour12} intlLocale={intlLocale} />
        </span>
      </div>
    </li>
  );
}

export default function EmailScreeningView({
  initialData,
  connected,
  contactOptions,
  projectOptions,
  taskOptions,
  programOptions,
  hour12,
  lang,
  title,
  dateLocale,
  location,
  headerActions,
}: {
  initialData: EmailScreeningPayload | null;
  connected: boolean;
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  programOptions: LinkOption[];
  hour12: boolean;
  lang: Lang;
  title: string;
  dateLocale: Locale | undefined;
  location: string;
  headerActions?: ReactNode;
}) {
  const t = getDict(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";
  const [data, setData] = useState(initialData);
  // No cache yet on the very first-ever visit — start "loading" straight
  // away so the effect below can kick off the initial screen without a
  // synchronous setState call of its own (which the fetch's first `await`
  // already defers past).
  const [loading, setLoading] = useState(() => connected && (!initialData || isStale(initialData.fetchedAt)));
  // Optimistic local overrides so opening/linking/completing/undoing a
  // message updates the grouping immediately, without waiting on a round
  // trip. `null` means "explicitly cleared" (mark unread / uncomplete) as
  // opposed to `undefined`, meaning no override — fall back to server data.
  const [readOverrides, setReadOverrides] = useState<Record<string, string | null>>({});
  const [linkOverrides, setLinkOverrides] = useState<Record<string, boolean>>({});
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, string | null>>({});

  async function runScreening() {
    try {
      const res = await fetch("/api/email/inbox", { method: "POST" });
      if (res.ok) {
        setData((await res.json()) as EmailScreeningPayload);
        setReadOverrides({});
        setLinkOverrides({});
        setCompletedOverrides({});
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

  const header = (
    <PageHeader
      title={title}
      hour12={hour12}
      dateLocale={dateLocale}
      location={location}
      actions={
        <>
          {headerActions}
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amo-white/80">
              <Spinner className="h-3.5 w-3.5" />
              {t.email.screening}
            </span>
          )}
          <RefreshButton onClick={refresh} loading={loading} label={t.email.refresh} loadingLabel={t.email.refreshing} variant="header" />
        </>
      }
    />
  );

  useEffect(() => {
    // Runs once on mount: either there's no cache yet, or what's cached is
    // older than the 15-minute stale window (see @/lib/staleness) — both
    // cases silently refresh in the background while the (possibly stale)
    // cached view stays on screen, fetching straight into `loading`'s
    // already-true initial state above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connected && (!initialData || isStale(initialData.fetchedAt))) runScreening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function postJson(url: string, id: string) {
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  function markRead(id: string) {
    setReadOverrides((prev) => (prev[id] ? prev : { ...prev, [id]: new Date().toISOString() }));
    postJson("/api/email/mark-read", id);
  }

  function markUnread(id: string) {
    setReadOverrides((prev) => ({ ...prev, [id]: null }));
    postJson("/api/email/mark-unread", id);
  }

  function markLinked(threadId: string) {
    setLinkOverrides((prev) => ({ ...prev, [threadId]: true }));
  }

  function markComplete(id: string) {
    setCompletedOverrides((prev) => (prev[id] ? prev : { ...prev, [id]: new Date().toISOString() }));
    postJson("/api/email/mark-complete", id);
  }

  function markUncomplete(id: string) {
    setCompletedOverrides((prev) => ({ ...prev, [id]: null }));
    postJson("/api/email/mark-uncomplete", id);
  }

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
  const quickActionLabels = { reply: t.dashboard.emailReply, replyAll: t.dashboard.emailReplyAll, forward: t.dashboard.emailForward };
  const categoryLabels: Record<EmailCategory, string> = {
    NEEDS_REPLY: t.email.categoryNeedsReply,
    NEEDS_ATTENTION: t.email.categoryNeedsAttention,
    CAN_WAIT: t.email.categoryCanWait,
    LOW_PRIORITY: t.email.categoryLowPriority,
  };

  function linkSummaryText(link: EmailLinkInfo | undefined): string | null {
    if (!link) return null;
    const name = link.contactName || link.projectName || link.taskName || link.affiliateProgramName;
    return name ? t.linkPicker.linkedTo(name) : null;
  }

  function linkedTo(link: EmailLinkInfo | undefined): { name: string; href: string } | null {
    if (!link) return null;
    if (link.contactName) return { name: link.contactName, href: `/contacts/${link.contactId}` };
    if (link.projectName) return { name: link.projectName, href: `/projects/${link.projectId}` };
    if (link.affiliateProgramName) return { name: link.affiliateProgramName, href: `/marketing#${link.affiliateProgramId}` };
    if (link.taskName) return { name: link.taskName, href: `/projects/${link.projectId}/tasks/${link.taskId}/edit` };
    return null;
  }

  if (!connected) {
    return (
      <div className="space-y-6">
        {header}
        <p className="text-sm text-soft">
          {t.email.notConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {t.email.connectInSettings}
          </Link>
        </p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-card-bg px-5 py-8 text-sm text-soft shadow-sm">
          <Spinner className="h-5 w-5" />
          {t.email.screening}
        </div>
      </div>
    );
  }

  const isLinked = (e: { threadId: string }): boolean => linkOverrides[e.threadId] || Boolean(data?.linksByThread[e.threadId]);
  const readIso = (e: { id: string }): string | undefined => {
    const override = readOverrides[e.id];
    return override !== undefined ? (override ?? undefined) : data?.readStates[e.id];
  };
  const isCompleted = (id: string): boolean => {
    const override = completedOverrides[id];
    return override !== undefined ? override !== null : Boolean(data?.completions[id]);
  };

  const now = new Date().getTime();
  const emails = data?.emails ?? [];
  const sentAwaitingReply = data?.sentAwaitingReply ?? [];

  const completedEmails = emails.filter((e) => isCompleted(e.id));
  const activeEmails = emails.filter((e) => !isCompleted(e.id));
  const awaitingSent = sentAwaitingReply.filter((s) => s.status === "awaiting" && !isCompleted(s.id));
  const completedSent = sentAwaitingReply.filter((s) => s.status === "completed" || isCompleted(s.id));

  const groups: { category: EmailCategory; emails: EmailSummary[] }[] = CATEGORY_ORDER.map((category) => ({
    category,
    emails: activeEmails.filter((e) => !readIso(e) && data?.classifications[e.id] === category),
  })).filter((g) => g.emails.length > 0);

  const recentlyRead = activeEmails
    .filter((e) => {
      const iso = readIso(e);
      if (!iso || isLinked(e)) return false;
      return now - new Date(iso).getTime() <= RECENTLY_READ_WINDOW_MS;
    })
    .sort((a, b) => new Date(readIso(b)!).getTime() - new Date(readIso(a)!).getTime());

  const nothingToShow =
    groups.length === 0 &&
    recentlyRead.length === 0 &&
    awaitingSent.length === 0 &&
    completedEmails.length === 0 &&
    completedSent.length === 0;

  function receivedRows(list: EmailSummary[], opts: { markAsRead: boolean; showComplete?: boolean; showUncomplete?: boolean; showMarkUnread?: boolean }) {
    return list.map((email, i) => (
      <EmailRow
        key={email.id}
        index={i}
        highlight={isOwnDomainEmail(email.fromEmail)}
        primaryLabel={email.from}
        subject={email.subject}
        hasAttachments={email.hasAttachments}
        important={email.important}
        attachmentLabel={t.email.hasAttachment}
        importantLabel={t.email.isImportant}
        link={email.link}
        threadId={email.threadId}
        linkInfo={data?.linksByThread[email.threadId]}
        linkSummaryText={linkSummaryText(data?.linksByThread[email.threadId])}
        linkedTo={linkedTo(data?.linksByThread[email.threadId])}
        contactOptions={contactOptions}
        projectOptions={projectOptions}
        taskOptions={taskOptions}
        programOptions={programOptions}
        linkLabels={linkLabels}
        quickActionLabels={quickActionLabels}
        dateIso={email.date}
        hour12={hour12}
        intlLocale={intlLocale}
        onOpen={opts.markAsRead ? () => markRead(email.id) : undefined}
        onLinkSaved={() => markLinked(email.threadId)}
        onComplete={opts.showComplete ? () => markComplete(email.id) : undefined}
        onUncomplete={opts.showUncomplete ? () => markUncomplete(email.id) : undefined}
        onMarkUnread={opts.showMarkUnread ? () => markUnread(email.id) : undefined}
        completeLabel={t.email.markComplete}
        uncompleteLabel={t.email.markUncomplete}
        markUnreadLabel={t.email.markUnread}
      />
    ));
  }

  function sentRows(list: typeof sentAwaitingReply, opts: { showComplete?: boolean; showUncomplete?: boolean }) {
    return list.map((s, i) => (
      <EmailRow
        key={s.id}
        index={i}
        highlight={false}
        primaryLabel={s.to}
        subject={s.subject}
        attachmentLabel={t.email.hasAttachment}
        importantLabel={t.email.isImportant}
        link={s.link}
        threadId={s.threadId}
        linkInfo={data?.linksByThread[s.threadId]}
        linkSummaryText={linkSummaryText(data?.linksByThread[s.threadId])}
        linkedTo={linkedTo(data?.linksByThread[s.threadId])}
        contactOptions={contactOptions}
        projectOptions={projectOptions}
        taskOptions={taskOptions}
        programOptions={programOptions}
        linkLabels={linkLabels}
        quickActionLabels={quickActionLabels}
        dateIso={s.date}
        hour12={hour12}
        intlLocale={intlLocale}
        onLinkSaved={() => markLinked(s.threadId)}
        onComplete={opts.showComplete ? () => markComplete(s.id) : undefined}
        // A thread with status "completed" got that way because Gmail
        // shows a reply arrived — that can't be undone from here, so only
        // a thread manually completed while still "awaiting" gets an
        // uncomplete button.
        onUncomplete={opts.showUncomplete && s.status === "awaiting" ? () => markUncomplete(s.id) : undefined}
        completeLabel={t.email.markComplete}
        uncompleteLabel={t.email.markUncomplete}
        markUnreadLabel={t.email.markUnread}
      />
    ));
  }

  // Explicit order (not just CATEGORY_ORDER) so "Sent — awaiting reply"
  // lands between Needs a reply and Needs your attention regardless of
  // which category groups are actually non-empty right now, and Completed
  // always sits last.
  const needsReplyGroup = groups.find((g) => g.category === "NEEDS_REPLY");
  const restGroups = groups.filter((g) => g.category !== "NEEDS_REPLY");
  // One combined, date-sorted list for the Completed section — mixes
  // received messages marked done by hand with sent threads Gmail shows a
  // reply has arrived on.
  const completedCount = completedEmails.length + completedSent.length;
  const orderedSections: { key: string; heading: string; count: number; rows: React.ReactNode; dim?: boolean }[] = [
    ...(needsReplyGroup
      ? [{ key: "NEEDS_REPLY", heading: categoryLabels.NEEDS_REPLY, count: needsReplyGroup.emails.length, rows: receivedRows(needsReplyGroup.emails, { markAsRead: true, showComplete: true }) }]
      : []),
    ...(awaitingSent.length > 0
      ? [{ key: "SENT_AWAITING_REPLY", heading: t.email.sentAwaitingReply, count: awaitingSent.length, rows: sentRows(awaitingSent, { showComplete: true }) }]
      : []),
    ...restGroups.map((g) => ({
      key: g.category,
      heading: categoryLabels[g.category],
      count: g.emails.length,
      rows: receivedRows(g.emails, { markAsRead: true, showComplete: true }),
    })),
    ...(recentlyRead.length > 0
      ? [
          {
            key: "RECENTLY_READ",
            heading: t.email.recentlyRead,
            count: recentlyRead.length,
            rows: receivedRows(recentlyRead, { markAsRead: false, showComplete: true, showMarkUnread: true }),
            dim: true,
          },
        ]
      : []),
    ...(completedCount > 0
      ? [
          {
            key: "COMPLETED",
            heading: t.email.completed,
            count: completedCount,
            rows: [
              ...receivedRows(completedEmails, { markAsRead: false, showUncomplete: true }),
              ...sentRows(completedSent, { showUncomplete: true }),
            ],
            dim: true,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      {header}

      {nothingToShow && <p className="text-sm text-soft">{t.email.noMessages}</p>}

      {orderedSections.map((section) => {
        const color = SECTION_COLORS[section.key] ?? SECTION_COLORS.LOW_PRIORITY;
        return (
          <section key={section.key} className="overflow-hidden rounded-2xl border border-card-border shadow-sm">
            <div className={`flex items-center gap-2 px-4 py-2.5 ${color.headerBg}`}>
              <h2 className={`text-sm font-semibold uppercase tracking-wide ${color.headerText}`}>{section.heading}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color.badgeBg} ${color.badgeText}`}>{section.count}</span>
            </div>
            <ul className={`bg-card-bg ${section.dim ? "opacity-80" : ""}`}>{section.rows}</ul>
          </section>
        );
      })}
    </div>
  );
}
