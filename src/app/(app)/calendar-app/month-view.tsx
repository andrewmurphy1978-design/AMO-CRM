"use client";

import { format, isSameMonth, isToday, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import LinkedSummaryLine, { type LinkedSummaryLabels, type LinkedSummaryValues } from "./linked-summary";

// Same alternating-column idea as the day-grid view, applied to the 7
// weekday columns — today gets its own stronger tint on top.
function dayColumnBg(day: Date, columnIndex: number): string {
  if (isToday(day)) return "bg-amo-lime/25";
  return columnIndex % 2 === 0 ? "bg-card-bg" : "bg-black/[0.045]";
}

function EventPill({
  event,
  hour12,
  intlLocale,
  linkValues,
  contactById,
  projectById,
  taskById,
  linkedSummaryLabels,
  onRequestLink,
}: {
  event: CalendarEventSummary;
  hour12: boolean;
  intlLocale: string;
  linkValues: LinkedSummaryValues | undefined;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  linkedSummaryLabels: LinkedSummaryLabels;
  onRequestLink: (event: CalendarEventSummary) => void;
}) {
  const color = eventColor(event.colorId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank", "noopener,noreferrer")}
      className="flex cursor-pointer flex-col overflow-hidden rounded px-1.5 py-1 text-xs font-medium leading-tight shadow-sm transition-opacity hover:opacity-90"
      style={{ backgroundColor: color.bg, color: color.fg }}
      title={event.title}
    >
      <span className="min-w-0 whitespace-normal break-words">{event.title}</span>
      {!event.allDay && event.start && (
        <p className="text-[10px] font-normal opacity-90">
          {formatTimeRange(new Date(event.start), event.end ? new Date(event.end) : null, hour12, intlLocale)}
        </p>
      )}
      <LinkedSummaryLine
        values={linkValues}
        contactById={contactById}
        projectById={projectById}
        taskById={taskById}
        labels={linkedSummaryLabels}
        className="truncate text-[10px] font-normal opacity-90"
      />
      <div className="mt-auto flex justify-end pt-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRequestLink(event);
          }}
          className="shrink-0 rounded p-1 opacity-80 hover:bg-black/10 hover:opacity-100"
          title="Link"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function MonthView({
  weeks,
  eventsByDay,
  links,
  contactById,
  projectById,
  taskById,
  linkedSummaryLabels,
  monthAnchor,
  dateLocale,
  hour12,
  intlLocale,
  weekdayLabels,
  onRequestLink,
}: {
  weeks: Date[][]; // 6 weeks x 7 days
  eventsByDay: CalendarEventSummary[][][]; // same shape as weeks
  links: Record<string, LinkedSummaryValues>;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  linkedSummaryLabels: LinkedSummaryLabels;
  monthAnchor: Date;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  weekdayLabels: string[];
  onRequestLink: (event: CalendarEventSummary) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-card-border">
      <div className="grid shrink-0 grid-cols-7 border-b border-card-border">
        {weekdayLabels.map((label, i) => (
          <div
            key={label}
            className={`border-l border-card-border py-2 text-center text-xs font-semibold uppercase tracking-wide text-soft first:border-l-0 ${i % 2 === 0 ? "bg-card-bg" : "bg-black/[0.045]"}`}
          >
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
                className={`flex min-h-0 flex-col overflow-hidden border-l border-card-border p-1 first:border-l-0 ${dayColumnBg(day, di)}`}
              >
                <p
                  className={
                    isToday(day)
                      ? "shrink-0 text-sm font-bold text-amo-lime"
                      : isSameMonth(day, monthAnchor)
                        ? "shrink-0 text-sm font-medium text-ink"
                        : "shrink-0 text-sm text-soft/50"
                  }
                >
                  {format(day, "d", { locale: dateLocale })}
                </p>
                <div className="mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                  {eventsByDay[wi][di].map((event) => (
                    <EventPill
                      key={event.id}
                      event={event}
                      hour12={hour12}
                      intlLocale={intlLocale}
                      onRequestLink={onRequestLink}
                      linkValues={links[event.id]}
                      contactById={contactById}
                      projectById={projectById}
                      taskById={taskById}
                      linkedSummaryLabels={linkedSummaryLabels}
                    />
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
