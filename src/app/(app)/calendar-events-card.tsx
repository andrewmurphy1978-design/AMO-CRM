"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CalendarEventSummary } from "@/lib/google";
import type { EventLinkTargets } from "@/actions/calendar";
import Card from "@/components/section-card";
import type { Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { LinkOption } from "./link-dialog";
import EventPillList from "./event-pill-list";
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
  programs,
  noEventsLabel,
  notConnectedLabel,
  hour12,
  intlLocale,
  lang,
  eventDialogLabels,
  eventViewDialogLabels,
  linkPickerLabels,
  newEventLinks,
}: {
  title: string;
  events: CalendarEventSummary[];
  links: Record<string, EventLinkTargets>;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  bookings: LinkOption[];
  programs: LinkOption[];
  noEventsLabel: string;
  notConnectedLabel?: string;
  hour12: boolean;
  intlLocale: string;
  lang: Lang;
  eventDialogLabels: EventDialogLabels;
  eventViewDialogLabels: EventViewDialogLabels;
  // When set, the header gets a + button that starts a new event already
  // linked to these targets (e.g. the contact whose page this card is on).
  newEventLinks?: Partial<EventLinkTargets>;
  linkPickerLabels: { contact: string; project: string; task: string; booking: string; none: string; clear: string; searchPlaceholder: string; noResults: string };
}) {
  // Resolved here (client-side) from `lang` rather than taken as a raw
  // date-fns Locale prop — a Locale carries function values, which can't
  // cross the Server->Client boundary when this is rendered from a Server
  // Component detail page.
  const dateLocale = getDateLocale(lang);
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
    <Card
      color="calendarEvents"
      title={title}
      compact
      actions={
        newEventLinks && (
          <button
            type="button"
            title={eventDialogLabels.createTitle}
            aria-label={eventDialogLabels.createTitle}
            onClick={() => {
              // Next half hour, so the new event doesn't start in the past.
              const start = new Date();
              start.setSeconds(0, 0);
              start.setMinutes(start.getMinutes() < 30 ? 30 : 60);
              setDialogTarget({ start, links: newEventLinks });
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
          >
            +
          </button>
        )
      }
    >
      <EventPillList
        events={events}
        dateLocale={dateLocale}
        hour12={hour12}
        intlLocale={intlLocale}
        emptyLabel={notConnectedLabel ?? noEventsLabel}
        flush
        onSelect={setViewTarget}
      />

      <EventViewDialog
        eventId={viewTarget}
        links={viewTarget ? links[viewTarget] : undefined}
        contacts={contacts}
        projects={projects}
        tasks={tasks}
        bookings={bookings}
        programs={programs}
        onClose={() => setViewTarget(null)}
        onEdit={() => {
          const id = viewTarget;
          setViewTarget(null);
          if (id) setDialogTarget({ id });
        }}
        onDuplicate={() => {
          const id = viewTarget;
          setViewTarget(null);
          if (id) setDialogTarget({ duplicateOf: id });
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
        key={
          dialogTarget
            ? "id" in dialogTarget
              ? dialogTarget.id
              : "duplicateOf" in dialogTarget
                ? `dup-${dialogTarget.duplicateOf}`
                : dialogTarget.start.getTime()
            : "none"
        }
        target={dialogTarget}
        initialLinks={
          dialogTarget && "id" in dialogTarget
            ? links[dialogTarget.id]
            : dialogTarget && "duplicateOf" in dialogTarget
              ? links[dialogTarget.duplicateOf]
              : undefined
        }
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
        programs={programs}
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
