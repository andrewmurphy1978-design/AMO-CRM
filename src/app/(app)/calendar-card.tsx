"use client";

import { useState } from "react";
import Link from "next/link";
import { format, isToday, isTomorrow, type Locale } from "date-fns";
import RefreshButton from "./refresh-button";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { CalendarEventSummary } from "@/lib/google";

export interface CalendarLabels {
  title: string;
  refresh: string;
  refreshing: string;
  notConnected: string;
  connectInSettings: string;
  noEvents: string;
  today: string;
  tomorrow: string;
  openInCalendar: string;
}

function formatEventTime(event: CalendarEventSummary, dateLocale: Locale | undefined, labels: CalendarLabels): string {
  if (!event.start) return "";
  const date = new Date(event.start);
  const dayLabel = isToday(date) ? labels.today : isTomorrow(date) ? labels.tomorrow : format(date, "EEE MMM d", { locale: dateLocale });
  if (event.allDay) return dayLabel;
  return `${dayLabel} · ${format(date, "p", { locale: dateLocale })}`;
}

export default function CalendarCard({
  initial,
  connected,
  lang,
  labels,
}: {
  initial: CalendarEventSummary[] | null;
  connected: boolean;
  lang: "en" | "fr";
  labels: CalendarLabels;
}) {
  const [events, setEvents] = useState(initial);
  const [loading, setLoading] = useState(false);
  const dateLocale = getDateLocale(lang);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/calendar");
      if (res.ok) setEvents(((await res.json()) as { events: CalendarEventSummary[] }).events);
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
          {!events || events.length === 0 ? (
            <p className="text-sm text-soft">{labels.noEvents}</p>
          ) : (
            <ul className="space-y-2.5">
              {events.map((event) => (
                <li key={event.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amo-blue" />
                  <div className="min-w-0">
                    <p className="truncate text-ink">{event.title}</p>
                    <p className="text-xs text-soft">{formatEventTime(event, dateLocale, labels)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 border-t border-card-border pt-3 text-xs">
            <a
              href="https://calendar.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 hover:underline"
            >
              {labels.openInCalendar}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
