"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "@/lib/clsx";
import RefreshButton from "./refresh-button";
import { isOwnDomainEmail } from "@/lib/email-domain";
import { isStale } from "@/lib/staleness";
import type { EmailSummary, SentEmailSummary } from "@/lib/google";
import type { EmailScreeningPayload } from "@/lib/email-inbox";
import { EMAIL_SECTION_COLORS } from "./email-section-colors";

export interface EmailLabels {
  title: string;
  refresh: string;
  refreshing: string;
  screening: string;
  notConnected: string;
  connectInSettings: string;
  noItems: string;
  openEmails: string;
  categoryNeedsReply: string;
  categoryNeedsAttention: string;
  awaitingResponse: string;
}

// Fixed to roughly match the Calendar card's own height (its 3-day grid
// and upcoming table are both fixed-height scroll boxes, so its total
// height barely moves) — this card's last section scrolls internally
// instead of pushing the card taller.
const CARD_HEIGHT = 820;

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
  initialData,
  connected,
  hour12,
  lang,
  labels,
}: {
  initialData: EmailScreeningPayload | null;
  connected: boolean;
  hour12: boolean;
  lang: "en" | "fr";
  labels: EmailLabels;
}) {
  const [data, setData] = useState(initialData);
  // No cache yet on the very first-ever visit — start "loading" so the
  // effect below can kick off the initial screen without a synchronous
  // setState call of its own (the fetch's first `await` already defers
  // past that) — same shape as the Email page's own cold-start effect.
  const [loading, setLoading] = useState(() => connected && (!initialData || isStale(initialData.fetchedAt)));
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>({});
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connected && (!initialData || isStale(initialData.fetchedAt))) runScreening();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function markRead(id: string) {
    setReadOverrides((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
    fetch("/api/email/mark-read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

  const isRead = (id: string): boolean => readOverrides[id] || Boolean(data?.readStates[id]);
  // Anything marked Completed on the Email page must disappear from here
  // too — this card previously never checked completions at all, so a
  // thread completed there kept counting here, inflating these three
  // counts past what the Email page itself shows for the same data.
  const isCompleted = (id: string): boolean => Boolean(data?.completions[id]);
  const emails = data?.emails ?? [];
  // Only threads still genuinely awaiting a reply — sentAwaitingReply now
  // also carries ones Gmail shows a reply has arrived on (so the Email
  // page can list them under Completed), which don't belong in this card.
  const awaitingSent = (data?.sentAwaitingReply ?? []).filter((s) => s.status === "awaiting" && !isCompleted(s.id));
  const needsReply = emails.filter((e) => !isCompleted(e.id) && !isRead(e.id) && data?.classifications[e.id] === "NEEDS_REPLY");
  const needsAttention = emails.filter((e) => !isCompleted(e.id) && !isRead(e.id) && data?.classifications[e.id] === "NEEDS_ATTENTION");
  const nothingToShow = needsReply.length === 0 && awaitingSent.length === 0 && needsAttention.length === 0;

  // Name/Object stacked (Object smaller, right below) plus the date on
  // the right — no action icons here; opening the row is the only action,
  // same as clicking a row on the full Email page's own dialog would do.
  function emailRow(email: EmailSummary, i: number) {
    return (
      <li key={email.id}>
        <a
          href={email.link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => markRead(email.id)}
          className={`flex min-w-0 items-start gap-2 px-2 py-1.5 hover:opacity-80 ${
            isOwnDomainEmail(email.fromEmail) ? "bg-amo-gold/20" : i % 2 === 1 ? "bg-black/[0.03]" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{email.from}</p>
            <p className="truncate text-xs text-soft">{email.subject}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">{formatEmailDate(email.date, hour12, intlLocale)}</span>
        </a>
      </li>
    );
  }

  function sentRow(item: SentEmailSummary, i: number) {
    return (
      <li key={item.id}>
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex min-w-0 items-start gap-2 px-2 py-1.5 hover:opacity-80 ${i % 2 === 1 ? "bg-black/[0.03]" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{item.to}</p>
            <p className="truncate text-xs text-soft">{item.subject}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">{formatEmailDate(item.date, hour12, intlLocale)}</span>
        </a>
      </li>
    );
  }

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm" style={{ height: CARD_HEIGHT }}>
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="relative flex shrink-0 items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        {connected && (
          <Link
            href="/email"
            className="btn-primary absolute left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm"
          >
            {labels.openEmails}
          </Link>
        )}
        {connected && <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />}
      </div>

      {!connected ? (
        <p className="mt-3 text-sm text-soft">
          {labels.notConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {labels.connectInSettings}
          </Link>
        </p>
      ) : loading && !data ? (
        <div className="mt-3 flex flex-1 items-center justify-center gap-2 text-sm text-soft">
          <Spinner className="h-5 w-5" />
          {labels.screening}
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          {nothingToShow && <p className="text-sm text-soft">{labels.noItems}</p>}

          {needsReply.length > 0 && (
            <section className="shrink-0 overflow-hidden rounded-xl border border-card-border">
              <div className={`flex items-center gap-2 px-3 py-2 ${EMAIL_SECTION_COLORS.NEEDS_REPLY.headerBg}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.NEEDS_REPLY.headerText}`}>
                  {labels.categoryNeedsReply}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_SECTION_COLORS.NEEDS_REPLY.badgeBg} ${EMAIL_SECTION_COLORS.NEEDS_REPLY.badgeText}`}
                >
                  {needsReply.length}
                </span>
              </div>
              <ul className="bg-card-bg">{needsReply.map((e, i) => emailRow(e, i))}</ul>
            </section>
          )}

          {awaitingSent.length > 0 && (
            <section className="shrink-0 overflow-hidden rounded-xl border border-card-border">
              <div className={`flex items-center gap-2 px-3 py-2 ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.headerBg}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.headerText}`}>
                  {labels.awaitingResponse}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.badgeBg} ${EMAIL_SECTION_COLORS.SENT_AWAITING_REPLY.badgeText}`}
                >
                  {awaitingSent.length}
                </span>
              </div>
              <ul className="bg-card-bg">{awaitingSent.map((s, i) => sentRow(s, i))}</ul>
            </section>
          )}

          {needsAttention.length > 0 && (
            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-card-border">
              <div className={`flex shrink-0 items-center gap-2 px-3 py-2 ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.headerBg}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.headerText}`}>
                  {labels.categoryNeedsAttention}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.badgeBg} ${EMAIL_SECTION_COLORS.NEEDS_ATTENTION.badgeText}`}
                >
                  {needsAttention.length}
                </span>
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-card-bg">{needsAttention.map((e, i) => emailRow(e, i))}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
