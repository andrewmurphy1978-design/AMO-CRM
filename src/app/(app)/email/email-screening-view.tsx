"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Locale } from "date-fns";
import clsx from "@/lib/clsx";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { isOwnDomainEmail } from "@/lib/email-domain";
import { isStale } from "@/lib/staleness";
import type { EmailSummary } from "@/lib/google";
import { resolveEmailAddressColor, colorForAddress, primaryReceivedAddress, type EmailAddressColorEntry } from "@/lib/email-address-match";
import type { EmailCategory } from "@/lib/email-classifier";
import type { EmailLinkInfo, EmailScreeningPayload } from "@/lib/email-inbox";
import PageHeader from "../page-header";
import RefreshButton from "../refresh-button";
import EmailLinkPicker, { type LinkOption } from "./email-link-picker";
import EmailTime from "./email-time";
import EmailQuickActions, { type EmailQuickActionMode } from "../email-quick-actions";
import EmailDialog, { type EmailDialogLabels, type EmailDialogTarget } from "./email-dialog";
import EmailComposeDialog, { type EmailComposeLabels, type EmailComposeTarget, type ComposeMode } from "./email-compose-dialog";
import type { EmailLinkConfig } from "./email-link-fields";
import { fetchEmailDetail, listMailIdentitiesAction, type EmailDetail } from "@/actions/email-messages";
import { fetchDraftsAction, fetchDraftDetailAction, type DraftRow } from "@/actions/email-drafts";
import type { MailSource } from "@/lib/mail/identity";
import { GmailIcon, IonosIcon } from "./mail-brand-icons";
import type { LinkValues, LinkDialogLabels } from "../link-dialog";
import { EMAIL_SECTION_COLORS } from "../email-section-colors";

export type { EmailScreeningPayload };

const CATEGORY_ORDER: EmailCategory[] = ["NEEDS_REPLY", "NEEDS_ATTENTION", "CAN_WAIT", "LOW_PRIORITY"];
// Once opened, a message stays in "Recently read" for a week (in case it
// still needs linking to a client/project/task) — or in "Recently linked"
// instead, for the same week, once it's been linked. Completed messages
// get the same week-long window. Past that, a message drops out of the
// Email page's view entirely — it's still sitting in the real mailbox
// untouched, this is purely how long this screening view keeps showing it.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

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
      className="shrink-0 rounded-full bg-emerald-600 p-1 text-white hover:bg-emerald-700"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75 10 18l9.5-12" />
      </svg>
    </button>
  );
}

// Same white-check-on-green look as UncompleteButton, but non-interactive —
// used for a sent thread Gmail marked completed by detecting a reply. That
// state isn't something this app can undo, so it gets the same "done"
// marker without a click handler, rather than no icon at all.
function CompletedBadge({ title }: { title: string }) {
  return (
    <span title={title} className="flex shrink-0 items-center justify-center rounded-full bg-emerald-600 p-1 text-white">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75 10 18l9.5-12" />
      </svg>
    </span>
  );
}

// The Recently Read section's "put it back" action — reopens the message
// into whichever category it was in before it was opened.
// A one-click "I've seen this, no need to open it" action on an unread
// row — same envelope glyph as MarkUnreadButton below (its opposite
// action), with a checkmark added so the two read at a glance as a pair
// rather than as unrelated icons.
function MarkReadButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className="shrink-0 rounded p-1 text-soft hover:bg-black/10 hover:text-ink">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 17.25V6.75Zm0 0 9.75 6.75 9.75-6.75"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 12 2.25 2.25L15.75 9" />
      </svg>
    </button>
  );
}

// A filled dot badge (the standard "unread" indicator most mail clients
// use) instead of MarkReadButton's checkmark — same envelope base, a
// distinctly different mark inside it so the two read apart at a glance
// rather than as near-identical envelopes.
function MarkUnreadButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title} className="shrink-0 rounded p-1 text-soft hover:bg-black/10 hover:text-ink">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 6.75c0-.621.504-1.125 1.125-1.125h17.25c.621 0 1.125.504 1.125 1.125v10.5c0 .621-.504 1.125-1.125 1.125H3.375A1.125 1.125 0 0 1 2.25 17.25V6.75Zm0 0 9.75 6.75 9.75-6.75"
        />
        <circle cx="19" cy="5.5" r="3.25" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}

// A CSS grid instead of a flex row: each column gets a minmax() range
// instead of a fixed pixel width, so the row always fills exactly the
// available width (no leftover dead space, no horizontal scroll on a
// normal desktop width) and reflows automatically whenever that width
// changes — a browser resize or the sidebar collapsing/expanding — with
// no JS involved. Only the subject column is allowed to actually grow
// (1fr); every other column has a fixed practical range. The icon
// cluster is "auto" (its own natural content width) since it's a set of
// fixed-size buttons, not text that benefits from extra room.
const ROW_GRID_COLUMNS =
  "[grid-template-columns:minmax(8rem,11rem)_minmax(12rem,1fr)_minmax(7rem,11rem)_auto_minmax(4.5rem,6rem)]";

function EmailRow({
  index,
  highlight,
  dotColor,
  dotTitle,
  primaryLabel,
  subject,
  hasAttachments,
  important,
  attachmentLabel,
  importantLabel,
  link,
  threadId,
  myAddress,
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
  onOpenDialog,
  onQuickAction,
  onLinkSaved,
  onComplete,
  onUncomplete,
  onMarkRead,
  onMarkUnread,
  completedLocked,
  completeLabel,
  uncompleteLabel,
  markReadLabel,
  markUnreadLabel,
}: {
  index: number;
  highlight: boolean;
  dotColor?: string | null;
  dotTitle?: string;
  primaryLabel: string;
  subject: string;
  hasAttachments?: boolean;
  important?: boolean;
  attachmentLabel: string;
  importantLabel: string;
  link: string;
  threadId: string;
  myAddress?: string | null;
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
  onOpenDialog: () => void;
  onQuickAction: (mode: EmailQuickActionMode) => void;
  onLinkSaved: (values: LinkValues) => void;
  onComplete?: () => void;
  onUncomplete?: () => void;
  onMarkRead?: () => void;
  onMarkUnread?: () => void;
  // True for a sent thread Gmail marked completed by detecting a reply —
  // that state can't be undone from here, so it gets a static badge
  // instead of the clickable UncompleteButton.
  completedLocked?: boolean;
  completeLabel: string;
  uncompleteLabel: string;
  markReadLabel: string;
  markUnreadLabel: string;
}) {
  function openDialog() {
    onOpen?.();
    onOpenDialog();
  }

  return (
    <li className={clsx("overflow-hidden transition-colors hover:bg-black/5", highlight ? "bg-amo-gold/20" : index % 2 === 1 ? "bg-black/[0.03]" : "")}>
      <div className={clsx("grid items-center gap-2 py-1.5 pl-3 pr-4", ROW_GRID_COLUMNS)}>
        <button type="button" onClick={openDialog} className="flex min-w-0 items-center gap-1.5 truncate text-left text-sm font-medium text-ink hover:opacity-80">
          {dotColor && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor }} title={dotTitle} />}
          <span className="truncate">{primaryLabel}</span>
        </button>
        <button
          type="button"
          onClick={openDialog}
          className="flex min-w-0 items-center gap-1 truncate text-left text-sm text-soft hover:opacity-80"
        >
          {hasAttachments && <AttachmentIcon className="h-3.5 w-3.5 shrink-0" title={attachmentLabel} />}
          {important && <ImportantIcon className="h-3.5 w-3.5 shrink-0 text-red-600" title={importantLabel} />}
          <span className="truncate">{subject}</span>
        </button>
        <span className="min-w-0 truncate text-right text-xs font-medium">
          {linkedTo && (
            <Link href={linkedTo.href} className="text-emerald-700 hover:underline">
              {linkedTo.name}
            </Link>
          )}
        </span>
        {/* This icon cluster (link/complete/mark-unread/reply-forward) is
            kept tighter than the grid's own gap-2 between columns — these
            read as one grouped set of actions, not separate columns — but
            not so tight that the Complete and Mark-unread icons (both
            shown together in Recently Read) crowd each other. */}
        <div className="flex items-center gap-1.5">
          <EmailLinkPicker
            threadId={threadId}
            subject={subject}
            fromLabel={primaryLabel}
            date={dateIso}
            link={link}
            myAddress={myAddress}
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
          {onComplete && <CompleteButton onClick={onComplete} title={completeLabel} />}
          {onUncomplete && <UncompleteButton onClick={onUncomplete} title={uncompleteLabel} />}
          {!onUncomplete && completedLocked && <CompletedBadge title={completeLabel} />}
          {/* A fixed-width slot even when neither action applies to this
              section (e.g. Sent — awaiting reply, Completed) — otherwise
              the reply/forward icons after it would shift left/right
              depending on which section a row belongs to. */}
          <span className="flex w-6 shrink-0 justify-center">
            {onMarkRead && <MarkReadButton onClick={onMarkRead} title={markReadLabel} />}
            {onMarkUnread && <MarkUnreadButton onClick={onMarkUnread} title={markUnreadLabel} />}
          </span>
          <EmailQuickActions labels={quickActionLabels} onOpen={onOpen} onAction={onQuickAction} />
        </div>
        <span className="whitespace-nowrap text-right text-xs text-soft">
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
  addressColors,
  hour12,
  lang,
  title,
  dateLocale,
  location,
  headerActions,
  defaultComposeSource,
  defaultFontFamily,
  defaultFontSize,
}: {
  initialData: EmailScreeningPayload | null;
  connected: boolean;
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  programOptions: LinkOption[];
  addressColors: EmailAddressColorEntry[];
  hour12: boolean;
  lang: Lang;
  title: string;
  dateLocale: Locale | undefined;
  location: string;
  headerActions?: ReactNode;
  defaultComposeSource: string | null;
  defaultFontFamily: string | null;
  defaultFontSize: string | null;
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
  const [openMessage, setOpenMessage] = useState<EmailDialogTarget | null>(null);
  const [composeTarget, setComposeTarget] = useState<EmailComposeTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(connected);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function refreshDrafts() {
    if (!connected) return;
    setDraftsLoading(true);
    try {
      setDrafts(await fetchDraftsAction());
    } catch {
      // Keep whatever drafts were already shown rather than clearing them.
    } finally {
      setDraftsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDraft(row: DraftRow) {
    const result = await fetchDraftDetailAction(row.id);
    if ("error" in result) return;
    const dotColor = colorForAddress(result.fromAddress, addressColors);
    setComposeTarget({
      message: {
        id: row.id,
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
        replyIdentity: { source: result.source, accountAddress: result.fromAddress, displayName: null },
        deliveredTo: result.fromAddress,
        // A single-entry list, not the user's full identity set — a
        // draft's account is fixed by which folder it's sitting in
        // (Gmail's own Drafts vs the IONOS mailbox's), so the From field
        // stays locked the same way it always has, unlike new/reply/
        // forward's now-editable dropdown.
        availableIdentities: [{ source: result.source, accountAddress: result.fromAddress, displayName: null }],
      },
      mode: "draft",
      dotColor,
      draft: { id: row.id, source: row.source },
    });
  }

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
          <button
            type="button"
            onClick={openNewCompose}
            className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            {t.email.newEmail}
          </button>
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

  // Rebuilds an EmailLinkInfo purely from the option lists already in
  // scope — no server round trip needed, since a LinkValues selection and
  // its display name/id are both already known client-side the instant
  // the editor's own Save resolves.
  function valuesToLinkInfo(values: LinkValues): EmailLinkInfo {
    const contact = contactOptions.find((c) => c.id === values.contactId);
    const project = projectOptions.find((p) => p.id === values.projectId);
    const task = taskOptions.find((tk) => tk.id === values.taskId);
    const program = programOptions.find((p) => p.id === values.affiliateProgramId);
    return {
      contactId: values.contactId,
      projectId: values.projectId,
      taskId: values.taskId,
      affiliateProgramId: values.affiliateProgramId,
      contactName: contact?.label ?? "",
      projectName: project?.label ?? "",
      taskName: task?.label ?? "",
      affiliateProgramName: program?.label ?? "",
      // The real DB row's updatedAt would be "now" too on the save this
      // reconstructs (see EmailLinkInfo's own comment) — this is only ever
      // stale if the row already existed with an older updatedAt and this
      // save is itself what bumps it, which is exactly the case here.
      linkedAt: new Date().toISOString(),
    };
  }

  // Runs after a successful saveEmailLink — patches every place that
  // shows the link (the cached screening data a row reads from, and
  // whichever dialog is currently open) immediately, instead of waiting on
  // a full refetch. Without this, the Email/Compose dialogs' read-only
  // "Linked to" summary kept showing the pre-save value until the next
  // manual Refresh, since it was only ever computed once at dialog-open
  // time from data that a client-side save never touched.
  function applyLinkSave(threadId: string, values: LinkValues) {
    markLinked(threadId);
    const info = valuesToLinkInfo(values);
    setData((prev) => (prev ? { ...prev, linksByThread: { ...prev.linksByThread, [threadId]: info } } : prev));
    const current = linkedTo(info);
    setOpenMessage((prev) =>
      prev && prev.linkConfig?.threadId === threadId ? { ...prev, linkConfig: { ...prev.linkConfig, current, initial: values } } : prev
    );
    setComposeTarget((prev) =>
      prev && prev.linkConfig?.threadId === threadId ? { ...prev, linkConfig: { ...prev.linkConfig, current, initial: values } } : prev
    );
  }

  function markComplete(id: string) {
    setCompletedOverrides((prev) => (prev[id] ? prev : { ...prev, [id]: new Date().toISOString() }));
    postJson("/api/email/mark-complete", id);
  }

  function markUncomplete(id: string) {
    setCompletedOverrides((prev) => ({ ...prev, [id]: null }));
    postJson("/api/email/mark-uncomplete", id);
  }

  // The Email page's own "New email" button — no original message to pull
  // an identity from (unlike reply/forward), so this asks for the user's
  // real connected identities directly and preselects whichever one
  // Settings' "Default account for new emails" names, still changeable in
  // the dialog's own From dropdown.
  async function openNewCompose() {
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
          to: [],
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
      setToast(emailDialogLabels.loadFailed);
    }
  }

  // The row-level Reply/Reply All/Forward icons need the message's full
  // detail (From/To/Cc/body/identity) to prefill compose, which the list
  // view never fetches — same fetchEmailDetail call the Email Dialog
  // itself makes when opened.
  async function openComposeFor(id: string, mode: ComposeMode) {
    try {
      const result = await fetchEmailDetail(id);
      if ("error" in result) return;
      setComposeTarget(composeTargetFrom(result, mode));
    } catch {
      // A rejected call (e.g. a transient Cloudflare/Hyperdrive error)
      // otherwise fails silently — there's no loading state tied to this
      // one, but the row's icon click would do nothing with no feedback.
      setToast(emailDialogLabels.loadFailed);
    }
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
  const emailDialogLabels: EmailDialogLabels = t.emailDialog;
  const emailComposeLabels: EmailComposeLabels = t.emailCompose;
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

  // The Email/Compose dialogs' "Linked to" config — same contact/project/
  // task/program data every row's EmailLinkPicker already uses, bundled up
  // for EmailLinkSummary/EmailLinkEditor to render inline (see
  // email-link-fields.tsx) instead of behind a modal.
  function buildLinkConfig(threadId: string, subject: string, fromLabel: string, dateIso: string, link: string, myAddress: string | null): EmailLinkConfig {
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

  // Reply/forward's colored header and "Linked to" section both key off the
  // original message being replied to, not the identity actually sending
  // the reply — reusing that context is what makes the compose dialog's
  // color and link picker consistent with the message it's answering.
  function composeTargetFrom(message: EmailDetail, mode: ComposeMode): EmailComposeTarget {
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
        primaryReceivedAddress(emailLike)
      ),
    };
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
  const linkedAtIso = (e: { threadId: string }): string | undefined => data?.linksByThread[e.threadId]?.linkedAt;
  const readIso = (e: { id: string }): string | undefined => {
    const override = readOverrides[e.id];
    return override !== undefined ? (override ?? undefined) : data?.readStates[e.id];
  };
  const isCompleted = (id: string): boolean => {
    const override = completedOverrides[id];
    return override !== undefined ? override !== null : Boolean(data?.completions[id]);
  };
  const completedAtIso = (id: string): string | undefined => {
    const override = completedOverrides[id];
    return override !== undefined ? (override ?? undefined) : data?.completions[id];
  };

  const now = new Date().getTime();
  // No timestamp to judge by (e.g. a Gmail-detected "reply arrived"
  // completion, which has no EmailCompletion row) never gets hidden by
  // this — only a completion this app actually timestamped ages out.
  const withinWindow = (iso: string | undefined): boolean => !iso || now - new Date(iso).getTime() <= SEVEN_DAYS_MS;
  const emails = data?.emails ?? [];
  const sentAwaitingReply = data?.sentAwaitingReply ?? [];

  // Aging out of Completed's own 7-day window doesn't return a message to
  // "active" — activeEmails always excludes every completed message
  // regardless of age, so once completedEmails' own window filter below
  // also excludes it, the message is simply gone from this page, not
  // reclassified back into a live category.
  const completedEmails = emails.filter((e) => isCompleted(e.id) && withinWindow(completedAtIso(e.id)));
  const activeEmails = emails.filter((e) => !isCompleted(e.id));
  const awaitingSent = sentAwaitingReply.filter((s) => s.status === "awaiting" && !isCompleted(s.id));
  const completedSent = sentAwaitingReply.filter((s) => (s.status === "completed" || isCompleted(s.id)) && withinWindow(completedAtIso(s.id)));

  const groups: { category: EmailCategory; emails: EmailSummary[] }[] = CATEGORY_ORDER.map((category) => ({
    category,
    emails: activeEmails.filter((e) => !readIso(e) && data?.classifications[e.id] === category),
  })).filter((g) => g.emails.length > 0);

  const recentlyRead = activeEmails
    .filter((e) => {
      const iso = readIso(e);
      if (!iso || isLinked(e)) return false;
      return now - new Date(iso).getTime() <= SEVEN_DAYS_MS;
    })
    .sort((a, b) => new Date(readIso(b)!).getTime() - new Date(readIso(a)!).getTime());

  // Where a read-and-linked message goes instead of Recently Read — same
  // week-long window, keyed off when it was linked rather than when it was
  // read, so re-linking (or first linking) an older already-read message
  // resets its own visibility clock. A linked message that's still unread
  // stays in its normal classification category until it's opened, same
  // as before this section existed.
  const recentlyLinked = activeEmails
    .filter((e) => {
      if (!isLinked(e) || !readIso(e)) return false;
      const iso = linkedAtIso(e);
      return !iso || now - new Date(iso).getTime() <= SEVEN_DAYS_MS;
    })
    .sort((a, b) => new Date(linkedAtIso(b) ?? 0).getTime() - new Date(linkedAtIso(a) ?? 0).getTime());

  const nothingToShow =
    groups.length === 0 &&
    recentlyRead.length === 0 &&
    recentlyLinked.length === 0 &&
    awaitingSent.length === 0 &&
    completedEmails.length === 0 &&
    completedSent.length === 0;

  function receivedRows(list: EmailSummary[], opts: { markAsRead: boolean; showComplete?: boolean; showUncomplete?: boolean; showMarkUnread?: boolean }) {
    return list.map((email, i) => {
      const dotColor = resolveEmailAddressColor(email, addressColors);
      return (
      <EmailRow
        key={email.id}
        index={i}
        highlight={isOwnDomainEmail(email.fromEmail)}
        dotColor={dotColor}
        dotTitle={dotColor ? email.deliveredTo || email.toRaw : undefined}
        myAddress={primaryReceivedAddress(email)}
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
        onOpenDialog={() =>
          setOpenMessage({
            id: email.id,
            link: email.link,
            dotColor,
            linkConfig: buildLinkConfig(email.threadId, email.subject, email.from, email.date, email.link, primaryReceivedAddress(email)),
          })
        }
        onQuickAction={(mode) => openComposeFor(email.id, mode)}
        onLinkSaved={(values) => applyLinkSave(email.threadId, values)}
        onComplete={opts.showComplete ? () => markComplete(email.id) : undefined}
        onUncomplete={opts.showUncomplete ? () => markUncomplete(email.id) : undefined}
        // Only the still-unread categorized sections (the ones markAsRead
        // also applies to) get a one-click "mark as read" — Recently Read
        // is already read and shows the opposite (mark as unread) action
        // instead, and Completed has no Complete/read pairing to fit into.
        onMarkRead={opts.markAsRead ? () => markRead(email.id) : undefined}
        onMarkUnread={opts.showMarkUnread ? () => markUnread(email.id) : undefined}
        completeLabel={t.email.markComplete}
        uncompleteLabel={t.email.markUncomplete}
        markReadLabel={t.email.markRead}
        markUnreadLabel={t.email.markUnread}
      />
      );
    });
  }

  function sentRows(list: typeof sentAwaitingReply, opts: { showComplete?: boolean; showUncomplete?: boolean }) {
    return list.map((s, i) => {
      const dotColor = colorForAddress(s.fromEmail, addressColors);
      return (
      <EmailRow
        key={s.id}
        index={i}
        highlight={false}
        dotColor={dotColor}
        dotTitle={dotColor ? s.fromEmail : undefined}
        primaryLabel={s.to}
        subject={s.subject}
        attachmentLabel={t.email.hasAttachment}
        importantLabel={t.email.isImportant}
        link={s.link}
        threadId={s.threadId}
        myAddress={s.fromEmail ?? null}
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
        onOpenDialog={() =>
          setOpenMessage({
            id: s.id,
            link: s.link,
            dotColor,
            linkConfig: buildLinkConfig(s.threadId, s.subject, s.to, s.date, s.link, s.fromEmail ?? null),
          })
        }
        onQuickAction={(mode) => openComposeFor(s.id, mode)}
        onLinkSaved={(values) => applyLinkSave(s.threadId, values)}
        onComplete={opts.showComplete ? () => markComplete(s.id) : undefined}
        // A thread with status "completed" got that way because Gmail
        // shows a reply arrived — that can't be undone from here, so only
        // a thread manually completed while still "awaiting" gets an
        // uncomplete button.
        onUncomplete={opts.showUncomplete && s.status === "awaiting" ? () => markUncomplete(s.id) : undefined}
        completedLocked={opts.showUncomplete && s.status === "completed"}
        completeLabel={t.email.markComplete}
        uncompleteLabel={t.email.markUncomplete}
        markReadLabel={t.email.markRead}
        markUnreadLabel={t.email.markUnread}
      />
      );
    });
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
    ...(recentlyLinked.length > 0
      ? [
          {
            key: "RECENTLY_LINKED",
            heading: t.email.recentlyLinked,
            count: recentlyLinked.length,
            rows: receivedRows(recentlyLinked, { markAsRead: false, showComplete: true, showMarkUnread: true }),
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

      {drafts.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-card-border shadow-sm">
          <div className={`flex items-center gap-2 px-4 py-2.5 ${EMAIL_SECTION_COLORS.DRAFTS.headerBg}`}>
            <h2 className={`text-sm font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.DRAFTS.headerText}`}>{t.email.draftsTitle}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${EMAIL_SECTION_COLORS.DRAFTS.badgeBg} ${EMAIL_SECTION_COLORS.DRAFTS.badgeText}`}>
              {drafts.length}
            </span>
            {draftsLoading && <Spinner className="h-3.5 w-3.5 text-white/80" />}
          </div>
          <ul className="divide-y divide-card-border bg-card-bg">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button
                  type="button"
                  onClick={() => openDraft(draft)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.03]"
                >
                  {draft.source === "gmail" ? <GmailIcon className="h-4 w-4 shrink-0" /> : <IonosIcon className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">
                    {draft.to || t.email.draftNoRecipient}
                    {draft.subject && <span className="text-soft"> — {draft.subject}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-soft">
                    <EmailTime iso={draft.date} hour12={hour12} intlLocale={intlLocale} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nothingToShow && drafts.length === 0 && <p className="text-sm text-soft">{t.email.noMessages}</p>}

      {orderedSections.map((section) => {
        const color = EMAIL_SECTION_COLORS[section.key] ?? EMAIL_SECTION_COLORS.LOW_PRIORITY;
        return (
          <section key={section.key} className="overflow-hidden rounded-2xl border border-card-border shadow-sm">
            <div className={`flex items-center gap-2 px-4 py-2.5 ${color.headerBg}`}>
              <h2 className={`text-sm font-semibold uppercase tracking-wide ${color.headerText}`}>{section.heading}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color.badgeBg} ${color.badgeText}`}>{section.count}</span>
            </div>
            <ul className={`overflow-x-auto bg-card-bg ${section.dim ? "opacity-80" : ""}`}>{section.rows}</ul>
          </section>
        );
      })}

      <EmailDialog
        target={openMessage}
        onClose={() => setOpenMessage(null)}
        onReply={(detail: EmailDetail, mode: ComposeMode) => {
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
        labels={emailDialogLabels}
      />

      <EmailComposeDialog
        target={composeTarget}
        onClose={() => setComposeTarget(null)}
        onSent={() => {
          setComposeTarget(null);
          setToast(emailComposeLabels.sentToast);
          refreshDrafts();
        }}
        onDiscarded={() => {
          setComposeTarget(null);
          setToast(emailComposeLabels.discardedToast);
          refreshDrafts();
        }}
        onDraftSaved={() => {
          setComposeTarget(null);
          setToast(emailComposeLabels.draftSavedToast);
          refreshDrafts();
        }}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        hour12={hour12}
        defaultFontFamily={defaultFontFamily}
        defaultFontSize={defaultFontSize}
        labels={emailComposeLabels}
      />

      {toast && (
        <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}
    </div>
  );
}
