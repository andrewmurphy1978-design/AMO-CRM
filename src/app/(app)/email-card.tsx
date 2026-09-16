"use client";

import { useState } from "react";
import Link from "next/link";
import RefreshButton from "./refresh-button";
import type { EmailSummary } from "@/lib/google";

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
  initial,
  connected,
  hour12,
  lang,
  labels,
}: {
  initial: EmailSummary[] | null;
  connected: boolean;
  hour12: boolean;
  lang: "en" | "fr";
  labels: EmailLabels;
}) {
  const [emails, setEmails] = useState(initial);
  const [loading, setLoading] = useState(false);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/email");
      if (res.ok) setEmails(((await res.json()) as { emails: EmailSummary[] }).emails);
    } catch {
      // Keep showing the last known list rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

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
          {!emails || emails.length === 0 ? (
            <p className="text-sm text-soft">{labels.noUnread}</p>
          ) : (
            <>
              <p className="text-xs font-medium text-soft">
                {emails.length === 1 ? labels.unreadOne : labels.unreadOtherTemplate.replace("{count}", String(emails.length))}
              </p>
              <ul className="mt-2 -mx-2 overflow-hidden rounded-lg">
                {emails.map((email, i) => (
                  <li key={email.id}>
                    <a
                      href={email.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex min-w-0 items-start gap-2 px-2 py-1.5 transition-colors hover:bg-amo-lime/10 ${
                        i % 2 === 1 ? "bg-black/[0.03]" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{email.from}</p>
                        <p className="truncate text-xs text-soft">{email.subject}</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-soft">
                        {formatEmailDate(email.date, hour12, intlLocale)}
                      </span>
                    </a>
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
