"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatTimeRange } from "@/lib/calendar-time";
import type { EventLinkTargets } from "@/actions/calendar";
import Card from "@/components/section-card";
import type { Lang } from "@/lib/i18n/dictionaries";
import type { LinkOption } from "./link-dialog";
import EventViewDialog, { type EventViewDialogLabels } from "./calendar-app/event-view-dialog";
import EventDialog, { type EventDialogLabels, type EventDialogTarget } from "./calendar-app/event-dialog";

// Shown on Contact and Project detail pages — lists whichever Google
// Calendar events have been linked to that client/project from the
// Calendar page's own linking. Clicking a row now opens the same Event
// Info/Edit dialogs the full Calendar page and Dashboard card use,
// instead of navigating out to Google Calendar's own site.
export default function CalendarEventsCard({
  title,
  events,
  links,
  contacts,
  projects,
  tasks,
  bookings,
  noEventsLabel,
  notConnectedLabel,
  hour12,
  dateLocale,
  intlLocale,
  lang,
  eventDialogLabels,
  eventViewDialogLabels,
  linkPickerLabels,
}: {
  title: string;
  events: CalendarEventSummary[];
  links: Record<string, EventLinkTargets>;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  bookings: LinkOption[];
  noEventsLabel: string;
  notConnectedLabel?: string;
  hour12: boolean;
  dateLocale: Locale | undefined;
  intlLocale: string;
  lang: Lang;
  eventDialogLabels: EventDialogLabels;
  eventViewDialogLabels: EventViewDialogLabels;
  linkPickerLabels: { contact: string; project: string; task: string; booking: string; none: string; clear: string; searchPlaceholder: string; noResults: string };
}) {
  const router = useRouter();
  const [viewTarget, setViewTarget] = useState<string | null>(null);
  const [dialogTarget, setDialogTarget] = useState<EventDialogTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // This card's own event list comes from the server at page load (it's
  // not backed by a client-side refresh endpoint the way the Dashboard
  // card and full Calendar page are) — router.refresh() re-runs the
  // Server Component so a save/delete here is reflected without a full
  // page reload, the same pattern already used elsewhere in this app for
  // a client action that needs freshly re-fetched server data.
  function refresh() {
    router.refresh();
  }

  return (
    <Card color="calendarEvents" title={title}>
      {events.length === 0 ? (
        <p className="mt-3 text-sm text-soft">{notConnectedLabel ?? noEventsLabel}</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {events.map((event) => {
            const color = eventColor(event.colorId);
            const eventDate = event.start ?? event.end;
            return (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() => setViewTarget(event.id)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: color.bg, color: color.fg }}
                >
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold">
                    {eventDate && format(new Date(eventDate), "MMM d", { locale: dateLocale })}
                    {!event.allDay && event.start &&
                      ` · ${formatTimeRange(new Date(event.start), event.end ? new Date(event.end) : null, hour12, intlLocale)}`}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-normal break-words">{event.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <EventViewDialog
        eventId={viewTarget}
        links={viewTarget ? links[viewTarget] : undefined}
        contacts={contacts}
        projects={projects}
        tasks={tasks}
        bookings={bookings}
        onClose={() => setViewTarget(null)}
        onEdit={() => {
          const id = viewTarget;
          setViewTarget(null);
          if (id) setDialogTarget({ id });
        }}
        onDeleted={() => {
          setViewTarget(null);
          refresh();
          setToast(eventDialogLabels.deleted);
        }}
        hour12={hour12}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        labels={eventViewDialogLabels}
      />

      <EventDialog
        key={dialogTarget ? ("id" in dialogTarget ? dialogTarget.id : dialogTarget.start.getTime()) : "none"}
        target={dialogTarget}
        initialLinks={dialogTarget && "id" in dialogTarget ? links[dialogTarget.id] : undefined}
        onClose={() => setDialogTarget(null)}
        onSaved={() => {
          refresh();
          setToast(eventDialogLabels.saved);
        }}
        onDeleted={() => {
          refresh();
          setToast(eventDialogLabels.deleted);
        }}
        contacts={contacts}
        projects={projects}
        tasks={tasks}
        bookings={bookings}
        lang={lang}
        hour12={hour12}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        labels={eventDialogLabels}
        linkLabels={linkPickerLabels}
      />

      {toast && (
        <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}
    </Card>
  );
}
