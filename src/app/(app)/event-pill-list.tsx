import { format } from "date-fns";
import type { Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";

// Shared "flat list of colored event pills" rendering — originally
// calendar-events-card.tsx's own <ul> (the Contact/Project detail pages'
// Calendar card), now also used by the Dashboard Calendar card's own "New
// events" section so both show events the same way: one self-contained
// colored row per event (its own date/time prefix, no separate day-header
// table), rather than grouping by day.
export default function EventPillList({
  events,
  dateLocale,
  hour12,
  intlLocale,
  emptyLabel,
  onSelect,
}: {
  events: CalendarEventSummary[];
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  emptyLabel: string;
  onSelect: (eventId: string) => void;
}) {
  if (events.length === 0) {
    return <p className="mt-3 text-sm text-soft">{emptyLabel}</p>;
  }

  return (
    <ul className="mt-3 space-y-1.5">
      {events.map((event) => {
        const color = eventColor(event.colorId);
        const eventDate = event.start ?? event.end;
        return (
          <li key={event.id}>
            <button
              type="button"
              onClick={() => onSelect(event.id)}
              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: color.bg, color: color.fg }}
            >
              <span className="shrink-0 whitespace-nowrap text-xs font-bold">
                {eventDate && format(new Date(eventDate), "MMM d", { locale: dateLocale })}
                {!event.allDay &&
                  event.start &&
                  ` · ${formatTimeRange(new Date(event.start), event.end ? new Date(event.end) : null, hour12, intlLocale)}`}
              </span>
              <span className="min-w-0 flex-1 whitespace-normal break-words">{event.title}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
