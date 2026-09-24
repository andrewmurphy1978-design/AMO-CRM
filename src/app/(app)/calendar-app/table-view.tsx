"use client";

import { format, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import LinkedSummaryLine, { type LinkedSummaryValues } from "./linked-summary";

// Shared by both the desktop table row and the mobile card below — same
// time+title+linked-summary content, just a different left offset for the
// linked-summary line since mobile has no date column to align under.
function EventRow({
  event,
  links,
  contactById,
  projectById,
  taskById,
  hour12,
  intlLocale,
  summaryClassName,
  onRequestEdit,
}: {
  event: CalendarEventSummary;
  links: Record<string, LinkedSummaryValues>;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  hour12: boolean;
  intlLocale: string;
  summaryClassName: string;
  onRequestEdit: (event: CalendarEventSummary) => void;
}) {
  const color = eventColor(event.colorId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onRequestEdit(event)}
      className="flex cursor-pointer flex-col overflow-hidden rounded px-1.5 py-1 transition-opacity hover:opacity-90"
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      <div className="flex items-start gap-1.5">
        <span className="w-28 shrink-0 font-bold">
          {!event.allDay && event.start
            ? formatTimeRange(new Date(event.start), event.end ? new Date(event.end) : null, hour12, intlLocale)
            : ""}
        </span>
        <span className="min-w-0 flex-1 whitespace-normal break-words">{event.title}</span>
      </div>
      <LinkedSummaryLine
        values={links[event.id]}
        contactById={contactById}
        projectById={projectById}
        taskById={taskById}
        className={summaryClassName}
      />
    </div>
  );
}

export default function TableView({
  days,
  eventsByDay,
  links,
  contactById,
  projectById,
  taskById,
  dateLocale,
  hour12,
  intlLocale,
  noEventsLabel,
  onRequestEdit,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  links: Record<string, LinkedSummaryValues>;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  noEventsLabel: string;
  onRequestEdit: (event: CalendarEventSummary) => void;
}) {
  return (
    <>
      {/* Desktop/tablet (sm+): unchanged — date in its own left column. */}
      <div className="hidden overflow-hidden rounded-xl border border-card-border sm:block">
        <table className="w-full border-collapse text-sm">
          <tbody>
            {days.map((day, i) => (
              <tr key={i} className="border-b border-card-border last:border-b-0">
                <td className="w-20 shrink-0 whitespace-nowrap border-r border-card-border bg-field-bg px-2 py-1 align-top font-medium text-ink">
                  {format(day, "EEE d MMM", { locale: dateLocale })}
                </td>
                <td className="px-2 py-1 align-top">
                  {eventsByDay[i].length === 0 ? (
                    <span className="text-soft">{noEventsLabel}</span>
                  ) : (
                    <div className="space-y-0.5">
                      {eventsByDay[i].map((event) => (
                        <EventRow
                          key={event.id}
                          event={event}
                          links={links}
                          contactById={contactById}
                          projectById={projectById}
                          taskById={taskById}
                          hour12={hour12}
                          intlLocale={intlLocale}
                          summaryClassName="ml-[7.375rem] mt-3 truncate text-sm font-normal opacity-90"
                          onRequestEdit={onRequestEdit}
                        />
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile only (below `sm`): the date sits as its own heading above
          that day's events instead of in a separate left column — a
          narrow screen has no room for a date column next to event text. */}
      <div className="divide-y divide-card-border overflow-hidden rounded-xl border border-card-border sm:hidden">
        {days.map((day, i) => (
          <div key={i} className="bg-card-bg p-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">
              {format(day, "EEE d MMM", { locale: dateLocale })}
            </p>
            {eventsByDay[i].length === 0 ? (
              <span className="text-sm text-soft">{noEventsLabel}</span>
            ) : (
              <div className="space-y-0.5">
                {eventsByDay[i].map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    links={links}
                    contactById={contactById}
                    projectById={projectById}
                    taskById={taskById}
                    hour12={hour12}
                    intlLocale={intlLocale}
                    summaryClassName="mt-3 truncate text-sm font-normal opacity-90"
                    onRequestEdit={onRequestEdit}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
