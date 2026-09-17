"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "@/lib/clsx";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { isOwnDomainEmail } from "@/lib/email-domain";
import type { EmailSummary } from "@/lib/google";
import type { EmailCategory } from "@/lib/email-classifier";
import type { EmailLinkInfo, EmailScreeningPayload } from "@/lib/email-inbox";
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

function EmailRow({
  index,
  highlight,
  primaryLabel,
  subject,
  link,
  threadId,
  linkInfo,
  linkSummaryText,
  contactOptions,
  projectOptions,
  taskOptions,
  linkLabels,
  quickActionLabels,
  dateIso,
  hour12,
  intlLocale,
  onOpen,
  onLinkSaved,
}: {
  index: number;
  highlight: boolean;
  primaryLabel: string;
  subject: string;
  link: string;
  threadId: string;
  linkInfo: EmailLinkInfo | undefined;
  linkSummaryText: string | null;
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  linkLabels: LinkDialogLabels;
  quickActionLabels: { reply: string; replyAll: string; forward: string };
  dateIso: string;
  hour12: boolean;
  intlLocale: string;
  onOpen?: () => void;
  onLinkSaved: (values: LinkValues) => void;
}) {
  return (
    <li className={highlight ? "bg-amo-gold/20" : index % 2 === 1 ? "bg-black/[0.03]" : ""}>
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
          className="min-w-0 flex-1 truncate text-sm text-soft hover:opacity-80"
        >
          {subject}
        </a>
        <EmailLinkPicker
          threadId={threadId}
          contacts={contactOptions}
          projects={projectOptions}
          tasks={taskOptions}
          initialContactId={linkInfo?.contactId ?? ""}
          initialProjectId={linkInfo?.projectId ?? ""}
          initialTaskId={linkInfo?.taskId ?? ""}
          summary={linkSummaryText}
          labels={linkLabels}
          onSaved={onLinkSaved}
        />
        <EmailQuickActions link={link} labels={quickActionLabels} onOpen={onOpen} />
        <span className="shrink-0 whitespace-nowrap text-xs text-soft">
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
  hour12,
  lang,
}: {
  initialData: EmailScreeningPayload | null;
  connected: boolean;
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  hour12: boolean;
  lang: Lang;
}) {
  const t = getDict(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";
  const [data, setData] = useState(initialData);
  // No cache yet on the very first-ever visit — start "loading" straight
  // away so the effect below can kick off the initial screen without a
  // synchronous setState call of its own (which the fetch's first `await`
  // already defers past).
  const [loading, setLoading] = useState(() => !initialData && connected);
  // Optimistic local overrides so opening/linking a message updates the
  // grouping immediately, without waiting on a round trip.
  const [readOverrides, setReadOverrides] = useState<Record<string, string>>({});
  const [linkOverrides, setLinkOverrides] = useState<Record<string, boolean>>({});

  async function runScreening() {
    try {
      const res = await fetch("/api/email/inbox", { method: "POST" });
      if (res.ok) {
        setData((await res.json()) as EmailScreeningPayload);
        setReadOverrides({});
        setLinkOverrides({});
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
    // Only ever auto-runs once, on the very first mount with no cache yet —
    // fetches straight into `loading`'s already-true initial state above,
    // same one-shot-fetch-on-mount shape as the Weather card's geolocation
    // effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!initialData && connected) runScreening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markRead(id: string) {
    setReadOverrides((prev) => (prev[id] ? prev : { ...prev, [id]: new Date().toISOString() }));
    fetch("/api/email/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  function markLinked(threadId: string) {
    setLinkOverrides((prev) => ({ ...prev, [threadId]: true }));
  }

  const linkLabels = {
    link: t.linkPicker.link,
    edit: t.linkPicker.edit,
    none: t.linkPicker.none,
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    save: t.linkPicker.save,
    saving: t.linkPicker.saving,
    cancel: t.linkPicker.cancel,
    clear: t.linkPicker.clear,
    title: t.linkPicker.title,
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
    const name = link.contactName || link.projectName || link.taskName;
    return name ? t.linkPicker.linkedTo(name) : null;
  }

  if (!connected) {
    return (
      <p className="text-sm text-soft">
        {t.email.notConnected}{" "}
        <Link href="/settings" className="font-semibold text-emerald-700 underline">
          {t.email.connectInSettings}
        </Link>
      </p>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-card-bg px-5 py-8 text-sm text-soft shadow-sm">
        <Spinner className="h-5 w-5" />
        {t.email.screening}
      </div>
    );
  }

  const isLinked = (e: { threadId: string }): boolean => linkOverrides[e.threadId] || Boolean(data?.linksByThread[e.threadId]);
  const readIso = (e: { id: string }): string | undefined => readOverrides[e.id] ?? data?.readStates[e.id];

  const now = new Date().getTime();
  const emails = data?.emails ?? [];
  const sentAwaitingReply = data?.sentAwaitingReply ?? [];

  const groups: { category: EmailCategory; emails: EmailSummary[] }[] = CATEGORY_ORDER.map((category) => ({
    category,
    emails: emails.filter((e) => !readIso(e) && data?.classifications[e.id] === category),
  })).filter((g) => g.emails.length > 0);

  const recentlyRead = emails
    .filter((e) => {
      const iso = readIso(e);
      if (!iso || isLinked(e)) return false;
      return now - new Date(iso).getTime() <= RECENTLY_READ_WINDOW_MS;
    })
    .sort((a, b) => new Date(readIso(b)!).getTime() - new Date(readIso(a)!).getTime());

  const nothingToShow = groups.length === 0 && recentlyRead.length === 0 && sentAwaitingReply.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end gap-3">
        {loading && (
          <span className="inline-flex items-center gap-1.5 text-xs text-soft">
            <Spinner className="h-3.5 w-3.5" />
            {t.email.screening}
          </span>
        )}
        <RefreshButton onClick={refresh} loading={loading} label={t.email.refresh} loadingLabel={t.email.refreshing} />
      </div>

      {nothingToShow && <p className="text-sm text-soft">{t.email.noMessages}</p>}

      {sentAwaitingReply.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
            {t.email.sentAwaitingReply} <span className="font-normal normal-case text-soft/70">({sentAwaitingReply.length})</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
            <ul>
              {sentAwaitingReply.map((s, i) => (
                <EmailRow
                  key={s.id}
                  index={i}
                  highlight={false}
                  primaryLabel={s.to}
                  subject={s.subject}
                  link={s.link}
                  threadId={s.threadId}
                  linkInfo={data?.linksByThread[s.threadId]}
                  linkSummaryText={linkSummaryText(data?.linksByThread[s.threadId])}
                  contactOptions={contactOptions}
                  projectOptions={projectOptions}
                  taskOptions={taskOptions}
                  linkLabels={linkLabels}
                  quickActionLabels={quickActionLabels}
                  dateIso={s.date}
                  hour12={hour12}
                  intlLocale={intlLocale}
                  onLinkSaved={() => markLinked(s.threadId)}
                />
              ))}
            </ul>
          </div>
        </section>
      )}

      {groups.map(({ category, emails: groupEmails }) => (
        <section key={category}>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
            {categoryLabels[category]} <span className="font-normal normal-case text-soft/70">({groupEmails.length})</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
            <ul>
              {groupEmails.map((email, i) => (
                <EmailRow
                  key={email.id}
                  index={i}
                  highlight={isOwnDomainEmail(email.fromEmail)}
                  primaryLabel={email.from}
                  subject={email.subject}
                  link={email.link}
                  threadId={email.threadId}
                  linkInfo={data?.linksByThread[email.threadId]}
                  linkSummaryText={linkSummaryText(data?.linksByThread[email.threadId])}
                  contactOptions={contactOptions}
                  projectOptions={projectOptions}
                  taskOptions={taskOptions}
                  linkLabels={linkLabels}
                  quickActionLabels={quickActionLabels}
                  dateIso={email.date}
                  hour12={hour12}
                  intlLocale={intlLocale}
                  onOpen={() => markRead(email.id)}
                  onLinkSaved={() => markLinked(email.threadId)}
                />
              ))}
            </ul>
          </div>
        </section>
      ))}

      {recentlyRead.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-soft">
            {t.email.recentlyRead} <span className="font-normal normal-case text-soft/70">({recentlyRead.length})</span>
          </h2>
          <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm opacity-80">
            <ul>
              {recentlyRead.map((email, i) => (
                <EmailRow
                  key={email.id}
                  index={i}
                  highlight={isOwnDomainEmail(email.fromEmail)}
                  primaryLabel={email.from}
                  subject={email.subject}
                  link={email.link}
                  threadId={email.threadId}
                  linkInfo={data?.linksByThread[email.threadId]}
                  linkSummaryText={linkSummaryText(data?.linksByThread[email.threadId])}
                  contactOptions={contactOptions}
                  projectOptions={projectOptions}
                  taskOptions={taskOptions}
                  linkLabels={linkLabels}
                  quickActionLabels={quickActionLabels}
                  dateIso={email.date}
                  hour12={hour12}
                  intlLocale={intlLocale}
                  onLinkSaved={() => markLinked(email.threadId)}
                />
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
