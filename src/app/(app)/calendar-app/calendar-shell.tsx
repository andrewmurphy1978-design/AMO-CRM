"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import type { Lang } from "@/lib/i18n/dictionaries";
import type { LinkOption } from "../link-dialog";
import EventDialog, { type EventDialogLabels, type EventDialogTarget } from "./event-dialog";
import EventViewDialog, { type EventViewDialogLabels } from "./event-view-dialog";
import PageHeader from "../page-header";
import RefreshButton from "../refresh-button";
import DayGridView from "./day-grid-view";
import MonthView from "./month-view";
import TableView from "./table-view";
import ViewModeMenu from "./view-mode-menu";

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
  eventDialog: EventDialogLabels;
  eventViewDialog: EventViewDialogLabels;
  linkPicker: { contact: string; project: string; task: string; booking: string; none: string; clear: string; searchPlaceholder: string; noResults: string };
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
  lang,
  labels,
  title,
  location,
  headerActions,
  refreshLabel,
  refreshingLabel,
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
  lang: Lang;
  labels: CalendarShellLabels;
  title: string;
  location: string;
  headerActions?: ReactNode;
  refreshLabel: string;
  refreshingLabel: string;
}) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState(initialEvents);
  const [links, setLinks] = useState(initialLinks);
  const [loading, setLoading] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<EventDialogTarget | null>(null);
  const [viewTarget, setViewTarget] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const containerRef = useRef<HTMLDivElement>(null);
  // Starts from a rough calc() estimate (header + page padding) so there's
  // no flash of an unstyled/collapsed box before the first measurement, then
  // refines to the container's *actual* distance from the top of the
  // viewport — robust to whatever the surrounding page layout does, instead
  // of a magic number that silently drifts.
  const [height, setHeight] = useState("calc(100dvh - 180px)");

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const top = containerRef.current.getBoundingClientRect().top;
      // <main> carries the same top/bottom padding (p-4 / sm:p-8), so the
      // gap this container should leave at the bottom matches its own
      // distance from the top of the viewport's visible content area.
      const bottomPadding = window.innerWidth >= 640 ? 32 : 16;
      // calc() with dvh — not a plain pixel height computed from
      // window.innerHeight or even visualViewport.height — is what makes
      // this robust on mobile. Either of those is a one-time JS snapshot:
      // scrolling the page collapses the browser's address bar, which
      // grows the *actually visible* area, but nothing tells this effect
      // to re-run at that exact moment, so the container stayed sized to
      // the smaller pre-scroll viewport and left real blank space below it
      // that the page could then scroll into. dvh is a live CSS value the
      // browser itself keeps in sync with the true visible area, no JS
      // re-measurement required — `top` is the only piece that genuinely
      // needs a one-time JS measurement, since CSS has no way to know a
      // sibling header's rendered height in advance.
      setHeight(`calc(100dvh - ${top + bottomPadding}px)`);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const { days, rangeStart, rangeEnd } = rangeForView(view, anchor);

  const contactById = useMemo(() => Object.fromEntries(contacts.map((c) => [c.id, c.label])), [contacts]);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.label])), [projects]);
  const taskById = useMemo(() => Object.fromEntries(tasks.map((t) => [t.id, t.label])), [tasks]);

  // Guards against an older request's response landing after a newer one
  // (e.g. clicking Refresh right after switching views) and clobbering it.
  const requestIdRef = useRef(0);
  // Aborts whichever fetch this replaces — without this, clicking Next
  // several times in quick succession (e.g. paging weeks forward) left
  // every earlier request running to completion server-side instead of
  // cancelling it, each one opening its own Hyperdrive connection via
  // withScopedPrismaClient. A handful of those landing together is the
  // same concurrent-connection pattern already fixed elsewhere in this
  // app for tripping Cloudflare's Error 1102 — abort keeps only the
  // latest navigation's request actually in flight.
  const abortRef = useRef<AbortController | null>(null);

  const fetchEvents = useCallback(async (start: Date, end: Date) => {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ start: start.toISOString(), end: end.toISOString() });
      const res = await fetch(`/api/calendar/events?${params.toString()}`, { signal: controller.signal });
      if (!res.ok || requestId !== requestIdRef.current) return;
      const data = (await res.json()) as { events?: CalendarEventSummary[]; links?: Record<string, EventLinkValues> };
      setEvents(data.events ?? []);
      setLinks(data.links ?? {});
    } catch {
      // Keep showing the last known events rather than clearing them —
      // this also swallows the AbortError from a superseded request.
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    fetchEvents(rangeStart, rangeEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rangeStart.getTime(), rangeEnd.getTime()]);

  function refresh() {
    fetchEvents(rangeStart, rangeEnd);
  }

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

  function requestEdit(event: CalendarEventSummary) {
    setViewTarget(event.id);
  }

  function requestCreate(presetStart?: Date, presetAllDay?: boolean) {
    // Clicking an empty slot in the grid/month views passes the exact
    // date/time to preset (see DayGridView/MonthView's onRequestCreate) —
    // otherwise (the header's Add button) default to "now" rounded up to
    // the next half hour.
    if (presetStart) {
      setDialogTarget({ start: presetStart, allDay: presetAllDay });
      return;
    }
    const now = new Date();
    now.setMinutes(now.getMinutes() < 30 ? 30 : 0, 0, 0);
    if (now <= new Date()) now.setHours(now.getHours() + 1);
    setDialogTarget({ start: now });
  }

  return (
    <>
      <PageHeader
        title={title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={location}
        actions={
          // Mobile only: this wrapper groups the action buttons with a much
          // tighter gap than PageHeader's own gap-3 — same trick as the
          // Email page's header (see its own comment for why `sm:contents`
          // is what keeps desktop's spacing exactly as it was).
          <div className="flex items-center gap-1 sm:contents">
            <button
              type="button"
              onClick={() => requestCreate()}
              title={labels.addEvent}
              aria-label={labels.addEvent}
              className="btn-primary flex items-center justify-center rounded-lg p-1.5 shadow-sm sm:justify-start sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:font-semibold"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              {/* Add event used to sit centered in the calendar's own
                  toolbar row — moved into the header like every other
                  page's create action. Mobile: bare icon in a square
                  button, matching the header's other icon-only buttons
                  (Refresh, Open Google Calendar) exactly. */}
              <span className="hidden sm:inline">{labels.addEvent}</span>
            </button>
            {headerActions}
            <RefreshButton
              onClick={refresh}
              loading={loading}
              label={refreshLabel}
              loadingLabel={refreshingLabel}
              variant="header"
              hideLabelOnMobile
              compactOnMobile
            />
          </div>
        }
      />
      {/* Height is measured against the container's real position (see the
          effect above) rather than assumed — a hardcoded calc() silently drifts
          whenever the surrounding page chrome changes and leaves a gap under
          the grid. min-h-0 stays load-bearing on every flex link below: flex
          items default to min-height:auto, refusing to shrink below their
          content's natural size, which is what caused the grid to grow the
          whole page instead of scrolling internally before this was added. */}
      <div ref={containerRef} className="flex flex-col" style={{ height }}>
      {/* Desktop/tablet (sm+): unchanged apart from Add Event no longer
          sitting in the now-removed center column — it moved to the page
          header above, so this is a plain two-group flex row instead of
          the old 3-column grid. */}
      <div className="hidden shrink-0 items-center justify-between gap-2 pb-3 sm:flex">
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

      {/* Mobile only (below `sm`): Google Calendar mobile's own layout — a
          small "jump to today" icon showing today's actual day-of-month
          (not the currently viewed date), a tight Previous/Next pair with
          no gap between them, the range label, and the view picker
          collapsed into ViewModeMenu's dropdown. */}
      <div className="flex shrink-0 items-center gap-2 pb-3 sm:hidden">
        <button
          type="button"
          onClick={() => setAnchor(startOfDay(new Date()))}
          aria-label={labels.today}
          title={labels.today}
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-card-border bg-card-bg text-sm font-bold text-ink"
        >
          <span className="absolute -top-px left-1.5 h-1 w-1.5 rounded-full bg-soft/50" />
          <span className="absolute -top-px right-1.5 h-1 w-1.5 rounded-full bg-soft/50" />
          {format(new Date(), "d")}
        </button>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setAnchor((a) => stepAnchor(view, a, -1))}
            aria-label="Previous"
            className="flex h-6 w-6 items-center justify-center rounded-md text-soft hover:bg-black/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setAnchor((a) => stepAnchor(view, a, 1))}
            aria-label="Next"
            className="flex h-6 w-6 items-center justify-center rounded-md text-soft hover:bg-black/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        {/* No `truncate` here on purpose — the user asked for the full
            range to show rather than clip with an ellipsis; without it,
            min-w-0 still lets this shrink and simply wrap instead of
            forcing the row wider than the viewport. */}
        <p className="min-w-0 flex-1 font-display text-xs font-semibold text-ink">{rangeLabel}</p>
        {loading && <span className="shrink-0 text-xs text-soft">…</span>}
        <ViewModeMenu value={view} onChange={setView} options={viewButtons} />
      </div>

      {/* Every view sits in this same flex-1/min-h-0 box so its own
          internal scroller (never the outer page) is what scrolls — Table
          view previously sat outside this wrapper with no height limit of
          its own, so its full list of days/events just kept growing the
          whole page instead of scrolling in place, leaving the widget's
          real content stranded above a tall blank gap once the page
          scrolled past it. */}
      <div className="-mx-4 -mb-4 min-h-0 flex-1 sm:-mx-8 sm:-mb-8">
        <div className="h-full p-2">
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
              onRequestEdit={requestEdit}
            />
          ) : view === "month" ? (
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
              onRequestEdit={requestEdit}
              onRequestCreate={requestCreate}
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
              onRequestEdit={requestEdit}
              onRequestCreate={requestCreate}
            />
          )}
        </div>
      </div>

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
          setToast(labels.eventDialog.deleted);
        }}
        hour12={hour12}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        labels={labels.eventViewDialog}
      />

      <EventDialog
        key={dialogTarget ? ("id" in dialogTarget ? dialogTarget.id : dialogTarget.start.getTime()) : "none"}
        target={dialogTarget}
        initialLinks={dialogTarget && "id" in dialogTarget ? links[dialogTarget.id] : undefined}
        onClose={() => setDialogTarget(null)}
        onSaved={() => {
          refresh();
          setToast(labels.eventDialog.saved);
        }}
        onDeleted={() => {
          refresh();
          setToast(labels.eventDialog.deleted);
        }}
        contacts={contacts}
        projects={projects}
        tasks={tasks}
        bookings={bookings}
        lang={lang}
        hour12={hour12}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
        labels={labels.eventDialog}
        linkLabels={labels.linkPicker}
      />

      {toast && (
        <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
          <div className="rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>
        </div>
      )}
      </div>
    </>
  );
}
