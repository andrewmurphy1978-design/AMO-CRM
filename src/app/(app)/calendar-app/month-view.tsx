"use client";

import { format, isSameMonth, isToday, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import LinkedSummaryLine, { type LinkedSummaryValues } from "./linked-summary";

// Same alternating-column idea as the day-grid view, applied to the 7
// weekday columns — today gets its own stronger, solid tint on top. Flat,
// fully opaque colors (not translucent overlays) so the page's own
// background image doesn't show through and distort the fill.
function dayColumnBg(day: Date, columnIndex: number): string {
  if (isToday(day)) return "bg-[#d7f2df]";
  return columnIndex % 2 === 0 ? "bg-card-bg" : "bg-[#f0efe8]";
}

function EventPill({
  event,
  hour12,
  intlLocale,
  linkValues,
  contactById,
  projectById,
  taskById,
  onRequestEdit,
}: {
  event: CalendarEventSummary;
  hour12: boolean;
  intlLocale: string;
  linkValues: LinkedSummaryValues | undefined;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  onRequestEdit: (event: CalendarEventSummary) => void;
}) {
  const color = eventColor(event.colorId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onRequestEdit(event)}
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
        className="mt-3 truncate text-xs font-normal opacity-90"
      />
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
  monthAnchor,
  dateLocale,
  hour12,
  intlLocale,
  weekdayLabels,
  onRequestEdit,
}: {
  weeks: Date[][]; // 6 weeks x 7 days
  eventsByDay: CalendarEventSummary[][][]; // same shape as weeks
  links: Record<string, LinkedSummaryValues>;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  monthAnchor: Date;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  weekdayLabels: string[];
  onRequestEdit: (event: CalendarEventSummary) => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-card-border">
      <div className="grid shrink-0 grid-cols-7 border-b border-card-border">
        {weekdayLabels.map((label, i) => (
          <div
            key={label}
            className={`border-l border-card-border py-2 text-center text-xs font-semibold uppercase tracking-wide text-soft first:border-l-0 ${i % 2 === 0 ? "bg-card-bg" : "bg-[#f0efe8]"}`}
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
                      onRequestEdit={onRequestEdit}
                      linkValues={links[event.id]}
                      contactById={contactById}
                      projectById={projectById}
                      taskById={taskById}
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
