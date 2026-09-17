import { format, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";

// Shown on Contact and Project detail pages — lists whichever Google
// Calendar events have been linked to that client/project from the
// Calendar page's own "Link" dialog. Each row opens the real event in
// Google Calendar, same click-through behavior as the Calendar page itself.
export default function CalendarEventsCard({
  title,
  events,
  noEventsLabel,
  notConnectedLabel,
  hour12,
  dateLocale,
  intlLocale,
}: {
  title: string;
  events: CalendarEventSummary[];
  noEventsLabel: string;
  notConnectedLabel?: string;
  hour12: boolean;
  dateLocale: Locale | undefined;
  intlLocale: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-soft">{notConnectedLabel ?? noEventsLabel}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {events.map((event) => {
            const color = eventColor(event.colorId);
            const eventDate = event.start ?? event.end;
            return (
              <li key={event.id}>
                <a
                  href={event.htmlLink ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: color.bg, color: color.fg }}
                >
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold">
                    {eventDate && format(new Date(eventDate), "MMM d", { locale: dateLocale })}
                    {!event.allDay && event.start &&
                      ` · ${formatTimeRange(new Date(event.start), event.end ? new Date(event.end) : null, hour12, intlLocale)}`}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-normal break-words">{event.title}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
