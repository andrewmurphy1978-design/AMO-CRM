"use client";

import { format, isSameMonth, isToday, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatClockTime } from "@/lib/calendar-time";

function EventPill({
  event,
  hour12,
  intlLocale,
  onRequestLink,
}: {
  event: CalendarEventSummary;
  hour12: boolean;
  intlLocale: string;
  onRequestLink: (event: CalendarEventSummary) => void;
}) {
  const color = eventColor(event.colorId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank", "noopener,noreferrer")}
      className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium leading-tight shadow-sm transition-opacity hover:opacity-90"
      style={{ backgroundColor: color.bg, color: color.fg }}
      title={event.title}
    >
      {!event.allDay && event.start && <span className="shrink-0">{formatClockTime(new Date(event.start), hour12, intlLocale)}</span>}
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRequestLink(event);
        }}
        className="shrink-0 opacity-80 hover:opacity-100"
        title="Link"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      </button>
    </div>
  );
}

export default function MonthView({
  weeks,
  eventsByDay,
  monthAnchor,
  dateLocale,
  hour12,
  intlLocale,
  weekdayLabels,
  onRequestLink,
}: {
  weeks: Date[][]; // 6 weeks x 7 days
  eventsByDay: CalendarEventSummary[][][]; // same shape as weeks
  monthAnchor: Date;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  weekdayLabels: string[];
  onRequestLink: (event: CalendarEventSummary) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-card-border">
      <div className="grid shrink-0 grid-cols-7 border-b border-card-border bg-field-bg">
        {weekdayLabels.map((label) => (
          <div key={label} className="border-l border-card-border py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-soft first:border-l-0">
            {label}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-rows-6 overflow-hidden">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid min-h-0 grid-cols-7 border-b border-card-border last:border-b-0">
            {week.map((day, di) => (
              <div
                key={di}
                className="flex min-h-0 flex-col overflow-hidden border-l border-card-border p-1 first:border-l-0"
              >
                <p
                  className={
                    isToday(day)
                      ? "shrink-0 text-xs font-bold text-amo-lime"
                      : isSameMonth(day, monthAnchor)
                        ? "shrink-0 text-xs font-medium text-ink"
                        : "shrink-0 text-xs text-soft/50"
                  }
                >
                  {format(day, "d", { locale: dateLocale })}
                </p>
                <div className="mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                  {eventsByDay[wi][di].map((event) => (
                    <EventPill key={event.id} event={event} hour12={hour12} intlLocale={intlLocale} onRequestLink={onRequestLink} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
