"use client";

import { format, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import LinkedSummaryLine, { type LinkedSummaryLabels, type LinkedSummaryValues } from "./linked-summary";

export default function TableView({
  days,
  eventsByDay,
  links,
  contactById,
  projectById,
  taskById,
  linkedSummaryLabels,
  dateLocale,
  hour12,
  intlLocale,
  noEventsLabel,
  onRequestLink,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  links: Record<string, LinkedSummaryValues>;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  linkedSummaryLabels: LinkedSummaryLabels;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  noEventsLabel: string;
  onRequestLink: (event: CalendarEventSummary) => void;
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
                          onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank", "noopener,noreferrer")}
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
                            labels={linkedSummaryLabels}
                            className="ml-[7.375rem] truncate text-xs font-normal opacity-90"
                          />
                          <div className="flex justify-end pt-0.5">
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
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                                />
                              </svg>
                            </button>
                          </div>
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
