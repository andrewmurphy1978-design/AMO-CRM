"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type Locale,
} from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import LinkDialog, { type LinkOption, type LinkDialogLabels, type LinkValues } from "../link-dialog";
import { saveCalendarEventLink } from "@/actions/links";
import DayGridView from "./day-grid-view";
import MonthView from "./month-view";
import TableView from "./table-view";

// Opens Google Calendar's own "create event" screen in a new tab — there's
// no in-app event editor (yet), so adding an event still happens on
// Google's side; this just saves the trip of finding that button yourself.
const GOOGLE_CALENDAR_NEW_EVENT_URL = "https://calendar.google.com/calendar/u/0/r/eventedit";

type ViewMode = "month" | "week" | "5day" | "3day" | "day" | "table";

interface EventLinkValues {
  contactId: string;
  projectId: string;
  taskId: string;
  bookingId: string;
}

function rangeForView(view: ViewMode, anchor: Date): { days: Date[]; rangeStart: Date; rangeEnd: Date } {
  const today = startOfDay(anchor);
  switch (view) {
    case "day":
      return { days: [today], rangeStart: today, rangeEnd: addDays(today, 1) };
    case "3day": {
      const days = [0, 1, 2].map((i) => addDays(today, i));
      return { days, rangeStart: days[0], rangeEnd: addDays(days[2], 1) };
    }
    case "5day": {
      const monday = startOfWeek(today, { weekStartsOn: 1 });
      const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
      return { days, rangeStart: days[0], rangeEnd: addDays(days[4], 1) };
    }
    case "week": {
      const sunday = startOfWeek(today, { weekStartsOn: 0 });
      const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
      return { days, rangeStart: days[0], rangeEnd: addDays(days[6], 1) };
    }
    case "month": {
      const gridStart = startOfWeek(startOfMonth(today), { weekStartsOn: 0 });
      const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
      return { days, rangeStart: days[0], rangeEnd: addDays(days[41], 1) };
    }
    case "table": {
      const days = Array.from({ length: 30 }, (_, i) => addDays(today, i));
      return { days, rangeStart: days[0], rangeEnd: addDays(days[29], 1) };
    }
  }
}

function stepAnchor(view: ViewMode, anchor: Date, dir: 1 | -1): Date {
  switch (view) {
    case "day":
      return addDays(anchor, dir);
    case "3day":
      return addDays(anchor, dir * 3);
    case "5day":
    case "week":
      return addDays(anchor, dir * 7);
    case "month":
      return addMonths(anchor, dir);
    case "table":
      return addDays(anchor, dir * 30);
  }
}

export interface CalendarShellLabels {
  today: string;
  addEvent: string;
  viewMonth: string;
  viewWeek: string;
  view5Day: string;
  view3Day: string;
  viewDay: string;
  viewTable: string;
  todayColumn: string;
  tomorrowColumn: string;
  noEvents: string;
  linkDialog: LinkDialogLabels;
}

export default function CalendarShell({
  initialEvents,
  initialLinks,
  contacts,
  projects,
  tasks,
  bookings,
  hour12,
  dateLocale,
  intlLocale,
  labels,
}: {
  initialEvents: CalendarEventSummary[];
  initialLinks: Record<string, EventLinkValues>;
  contacts: LinkOption[];
  projects: LinkOption[];
  tasks: LinkOption[];
  bookings: LinkOption[];
  hour12: boolean;
  dateLocale: Locale | undefined;
  intlLocale: string;
  labels: CalendarShellLabels;
}) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState(initialEvents);
  const [links, setLinks] = useState(initialLinks);
  const [loading, setLoading] = useState(false);
  const [linkTarget, setLinkTarget] = useState<CalendarEventSummary | null>(null);
  const isFirstRender = useRef(true);

  const containerRef = useRef<HTMLDivElement>(null);
  // Starts from a rough calc() estimate (header + page padding) so there's
  // no flash of an unstyled/collapsed box before the first measurement, then
  // refines to the container's *actual* distance from the bottom of the
  // viewport — robust to whatever the surrounding page layout does, instead
  // of a magic number that silently drifts (that's what previously left a
  // gap under the grid: the estimate wasn't ever recomputed against reality).
  const [height, setHeight] = useState("calc(100vh - 180px)");

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const top = containerRef.current.getBoundingClientRect().top;
      // <main> carries the same top/bottom padding (p-4 / sm:p-8), so the
      // gap this container should leave at the bottom matches its own
      // distance from the top of the viewport's visible content area.
      const bottomPadding = window.innerWidth >= 640 ? 32 : 16;
      setHeight(`${Math.max(320, window.innerHeight - top - bottomPadding)}px`);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { days, rangeStart, rangeEnd } = rangeForView(view, anchor);

  const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c.label])), [contacts]);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.label])), [projects]);
  const taskById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t.label])), [tasks]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ start: rangeStart.toISOString(), end: rangeEnd.toISOString() });
    fetch(`/api/calendar/events?${params.toString()}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ events?: CalendarEventSummary[]; links?: Record<string, EventLinkValues> }>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setEvents(data.events ?? []);
        setLinks(data.links ?? {});
      })
      .catch(() => {
        // Keep showing the last known events rather than clearing them.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rangeStart.getTime(), rangeEnd.getTime()]);

  const eventsByDay = days.map((day) => events.filter((e) => e.start && isSameDay(new Date(e.start), day)));

  const rangeLabel =
    view === "month"
      ? format(anchor, "MMMM yyyy", { locale: dateLocale })
      : view === "day"
        ? format(anchor, "EEEE, MMMM d, yyyy", { locale: dateLocale })
        : `${format(days[0], "MMM d", { locale: dateLocale })} – ${format(days[days.length - 1], "MMM d, yyyy", { locale: dateLocale })}`;

  const viewButtons: { key: ViewMode; label: string }[] = [
    { key: "month", label: labels.viewMonth },
    { key: "week", label: labels.viewWeek },
    { key: "5day", label: labels.view5Day },
    { key: "3day", label: labels.view3Day },
    { key: "day", label: labels.viewDay },
    { key: "table", label: labels.viewTable },
  ];

  const weekdayLabels = Array.from({ length: 7 }, (_, i) => format(addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), i), "EEE", { locale: dateLocale }));

  async function handleSaveLink(values: LinkValues) {
    if (!linkTarget) return;
    await saveCalendarEventLink(linkTarget.id, values);
    setLinks((prev) => ({ ...prev, [linkTarget.id]: values }));
  }

  // Calendar events never link to an affiliate program (that's an Email-page-
  // only target — see LinkDialog's `affiliatePrograms` prop), so this is
  // always blank here; still required to satisfy the shared LinkValues type.
  const linkInitial: LinkValues = {
    ...(linkTarget ? (links[linkTarget.id] ?? { contactId: "", projectId: "", taskId: "", bookingId: "" }) : { contactId: "", projectId: "", taskId: "", bookingId: "" }),
    affiliateProgramId: "",
  };

  return (
    // Height is measured against the container's real position (see the
    // effect above) rather than assumed — a hardcoded calc() silently drifts
    // whenever the surrounding page chrome changes and leaves a gap under
    // the grid. min-h-0 stays load-bearing on every flex link below: flex
    // items default to min-height:auto, refusing to shrink below their
    // content's natural size, which is what caused the grid to grow the
    // whole page instead of scrolling internally before this was added.
    <div ref={containerRef} className="flex flex-col" style={{ height }}>
      <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAnchor(startOfDay(new Date()))}
            className="rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
          >
            {labels.today}
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => stepAnchor(view, a, -1))}
            aria-label="Previous"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-soft hover:bg-black/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => stepAnchor(view, a, 1))}
            aria-label="Next"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-soft hover:bg-black/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <p className="font-display text-sm font-semibold text-ink sm:text-base">{rangeLabel}</p>
          {loading && <span className="text-xs text-soft">…</span>}
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => window.open(GOOGLE_CALENDAR_NEW_EVENT_URL, "_blank", "noopener,noreferrer")}
            className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm"
          >
            {labels.addEvent}
          </button>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {viewButtons.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setView(b.key)}
              className={
                view === b.key
                  ? "btn-primary rounded-lg px-3 py-1.5 text-sm font-semibold shadow-sm"
                  : "rounded-lg border border-card-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-black/5"
              }
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {view === "table" ? (
        <TableView
          days={days}
          eventsByDay={eventsByDay}
          links={links}
          contactById={contactById}
          projectById={projectById}
          taskById={taskById}
          dateLocale={dateLocale}
          hour12={hour12}
          intlLocale={intlLocale}
          noEventsLabel={labels.noEvents}
          onRequestLink={setLinkTarget}
        />
      ) : (
        <div className="-mx-4 -mb-4 min-h-0 flex-1 sm:-mx-8 sm:-mb-8">
          <div className="h-full p-2">
            {view === "month" ? (
              <MonthView
                weeks={Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7))}
                eventsByDay={Array.from({ length: 6 }, (_, w) => eventsByDay.slice(w * 7, w * 7 + 7))}
                links={links}
                contactById={contactById}
                projectById={projectById}
                taskById={taskById}
                monthAnchor={anchor}
                dateLocale={dateLocale}
                hour12={hour12}
                intlLocale={intlLocale}
                weekdayLabels={weekdayLabels}
                onRequestLink={setLinkTarget}
              />
            ) : (
              <DayGridView
                days={days}
                eventsByDay={eventsByDay}
                links={links}
                contactById={contactById}
                projectById={projectById}
                taskById={taskById}
                dateLocale={dateLocale}
                hour12={hour12}
                intlLocale={intlLocale}
                todayLabel={labels.todayColumn}
                tomorrowLabel={labels.tomorrowColumn}
                noEventsLabel={labels.noEvents}
                onRequestLink={setLinkTarget}
              />
            )}
          </div>
        </div>
      )}

      <LinkDialog
        key={linkTarget?.id ?? "none"}
        open={linkTarget !== null}
        onClose={() => setLinkTarget(null)}
        contacts={contacts}
        projects={projects}
        tasks={tasks}
        bookings={bookings}
        initial={linkInitial}
        onSave={handleSaveLink}
        labels={labels.linkDialog}
      />
    </div>
  );
}
