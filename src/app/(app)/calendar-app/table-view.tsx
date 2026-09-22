"use client";

import { format, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import LinkedSummaryLine, { type LinkedSummaryValues } from "./linked-summary";

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
    <div className="overflow-hidden rounded-xl border border-card-border">
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
                    {eventsByDay[i].map((event) => {
                      const color = eventColor(event.colorId);
                      return (
                        <div
                          key={event.id}
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
                            className="ml-[7.375rem] mt-3 truncate text-sm font-normal opacity-90"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
