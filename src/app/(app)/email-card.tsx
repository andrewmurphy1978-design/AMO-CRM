"use client";

import { useState } from "react";
import Link from "next/link";
import RefreshButton from "./refresh-button";
import EmailQuickActions from "./email-quick-actions";
import { isOwnDomainEmail } from "@/lib/email-domain";
import type { EmailSummary } from "@/lib/google";
import type { EmailCategory } from "@/lib/email-classifier";

export interface EmailLabels {
  title: string;
  refresh: string;
  refreshing: string;
  notConnected: string;
  connectInSettings: string;
  noUnread: string;
  unreadOne: string;
  unreadOtherTemplate: string;
  openInGmail: string;
  openIonosWebmail: string;
  reply: string;
  replyAll: string;
  forward: string;
  categoryNeedsReply: string;
  categoryNeedsAttention: string;
  categoryCanWait: string;
  categoryLowPriority: string;
}

const CATEGORY_BADGE_CLASS: Record<EmailCategory, string> = {
  NEEDS_REPLY: "bg-red-100 text-red-700",
  NEEDS_ATTENTION: "bg-amber-100 text-amber-800",
  CAN_WAIT: "bg-blue-100 text-blue-700",
  LOW_PRIORITY: "bg-black/5 text-soft",
};

// "3:15 PM" for something received today, "Sep 12, 3:15 PM" otherwise —
// matches the user's own 24h/12h preference (see the Date/Time card and
// Calendar) rather than a locale default.
function formatEmailDate(iso: string, hour12: boolean, intlLocale: string): string {
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: "2-digit", hour12 }).format(date);
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric" }).format(date);
  return `${day}, ${time}`;
}

export default function EmailCard({
  initial,
  initialClassifications,
  connected,
  hour12,
  lang,
  labels,
}: {
  initial: EmailSummary[] | null;
  initialClassifications: Record<string, EmailCategory>;
  connected: boolean;
  hour12: boolean;
  lang: "en" | "fr";
  labels: EmailLabels;
}) {
  const [emails, setEmails] = useState(initial);
  const [classifications, setClassifications] = useState(initialClassifications);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  const categoryLabels: Record<EmailCategory, string> = {
    NEEDS_REPLY: labels.categoryNeedsReply,
    NEEDS_ATTENTION: labels.categoryNeedsAttention,
    CAN_WAIT: labels.categoryCanWait,
    LOW_PRIORITY: labels.categoryLowPriority,
  };

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/email");
      if (res.ok) {
        const data = (await res.json()) as { emails: EmailSummary[]; classifications: Record<string, EmailCategory> };
        setEmails(data.emails);
        setClassifications(data.classifications);
        setReadIds(new Set());
      }
    } catch {
      // Keep showing the last known list rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  function markRead(id: string) {
    setReadIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    fetch("/api/email/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  const visibleEmails = (emails ?? []).filter((e) => !readIds.has(e.id));

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        {connected && (
          <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
        )}
      </div>
      {!connected ? (
        <p className="mt-3 text-sm text-soft">
          {labels.notConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {labels.connectInSettings}
          </Link>
        </p>
      ) : (
        <div className="mt-3">
          {visibleEmails.length === 0 ? (
            <p className="text-sm text-soft">{labels.noUnread}</p>
          ) : (
            <>
              <p className="text-xs font-medium text-soft">
                {visibleEmails.length === 1
                  ? labels.unreadOne
                  : labels.unreadOtherTemplate.replace("{count}", String(visibleEmails.length))}
              </p>
              <ul className="mt-2 -mx-2 overflow-hidden rounded-lg">
                {visibleEmails.map((email, i) => (
                  <li key={email.id}>
                    <div
                      className={`flex min-w-0 items-start gap-2 px-2 py-1.5 ${
                        isOwnDomainEmail(email.fromEmail) ? "bg-amo-gold/20" : i % 2 === 1 ? "bg-black/[0.03]" : ""
                      }`}
                    >
                      <a
                        href={email.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markRead(email.id)}
                        className="min-w-0 flex-1 hover:opacity-80"
                      >
                        <p className="truncate text-sm font-medium text-ink">{email.from}</p>
                        {classifications[email.id] && (
                          <span
                            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${CATEGORY_BADGE_CLASS[classifications[email.id]]}`}
                          >
                            {categoryLabels[classifications[email.id]]}
                          </span>
                        )}
                        <p className="truncate text-xs text-soft">{email.subject}</p>
                      </a>
                      <EmailQuickActions
                        link={email.link}
                        labels={{ reply: labels.reply, replyAll: labels.replyAll, forward: labels.forward }}
                        onOpen={() => markRead(email.id)}
                      />
                      <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">
                        {formatEmailDate(email.date, hour12, intlLocale)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-card-border pt-3 text-xs">
            <a
              href="https://mail.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 hover:underline"
            >
              {labels.openInGmail}
            </a>
            <a
              href="https://mail.ionos.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 hover:underline"
            >
              {labels.openIonosWebmail}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
