"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, isToday, isTomorrow, startOfDay, type Locale } from "date-fns";
import RefreshButton from "./refresh-button";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatClockTime, formatHourMark, formatTimeRange } from "@/lib/calendar-time";
import { layoutDayEvents, type TimedEvent } from "@/lib/calendar-layout";
import type { ResolvedEventLink } from "@/lib/calendar-links";
import type { EventLinkTargets } from "@/actions/calendar";
import EventViewDialog, { type EventViewDialogLabels } from "./calendar-app/event-view-dialog";
import EventDialog, { type EventDialogLabels, type EventDialogTarget } from "./calendar-app/event-dialog";
import type { LinkOption } from "./link-dialog";

export interface CalendarLabels {
  title: string;
  refresh: string;
  refreshing: string;
  notConnected: string;
  connectInSettings: string;
  noEvents: string;
  today: string;
  tomorrow: string;
  openInCalendar: string;
}

const GRID_START_HOUR = 6; // grid content starts at 6 AM...
const GRID_END_HOUR = 22; // ...through 10 PM, scrollable
const VISIBLE_HOURS = 8; // ...but only ~9 AM-5 PM is visible without scrolling
const ROW_HEIGHT = 48; // px per hour
const MIN_BLOCK_HEIGHT = 30; // px — enough room for a time range under the title

function minutesSinceGridStart(date: Date): number {
  const hours = date.getHours() + date.getMinutes() / 60;
  return (hours - GRID_START_HOUR) * 60;
}

// The dialogs only need the four raw ids to prefill their selections —
// ResolvedEventLink also carries display-ready names for the inline
// contact/project/task links shown in the grid boxes below.
function toLinkTargets(link: ResolvedEventLink | undefined): EventLinkTargets {
  return { contactId: link?.contactId ?? "", projectId: link?.projectId ?? "", taskId: link?.taskId ?? "", bookingId: link?.bookingId ?? "" };
}

function DayColumn({
  day,
  events,
  links,
  hour12,
  intlLocale,
  labels,
  onRequestEdit,
  onRequestCreate,
}: {
  day: Date;
  events: CalendarEventSummary[];
  links: Record<string, ResolvedEventLink>;
  hour12: boolean;
  intlLocale: string;
  labels: CalendarLabels;
  onRequestEdit: (event: CalendarEventSummary) => void;
  onRequestCreate: (date: Date, allDay?: boolean) => void;
}) {
  const timed: TimedEvent<CalendarEventSummary>[] = events
    .filter((e) => !e.allDay && e.start)
    .map((e) => {
      const start = new Date(e.start as string);
      const end = e.end ? new Date(e.end) : new Date(start.getTime() + 30 * 60 * 1000);
      const gridStart = 0;
      const gridEnd = (GRID_END_HOUR - GRID_START_HOUR) * 60;
      return {
        event: e,
        startMin: Math.max(gridStart, minutesSinceGridStart(start)),
        endMin: Math.min(gridEnd, Math.max(minutesSinceGridStart(end), minutesSinceGridStart(start) + 15)),
      };
    })
    .filter((e) => e.endMin > 0 && e.startMin < (GRID_END_HOUR - GRID_START_HOUR) * 60);

  const positioned = layoutDayEvents(timed);
  const hourMarks = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);

  // Same click-to-create idea as the full Calendar page's day-grid-view.tsx
  // — clicking empty space opens Add Event preset to the clicked date/time,
  // snapped to the nearest 30 minutes.
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const totalMinutes = (offsetY / ROW_HEIGHT) * 60;
    const gridMinutes = (GRID_END_HOUR - GRID_START_HOUR) * 60;
    const snapped = Math.min(Math.max(Math.round(totalMinutes / 30) * 30, 0), gridMinutes - 30);
    const target = new Date(day);
    target.setHours(GRID_START_HOUR, snapped, 0, 0);
    onRequestCreate(target);
  }

  return (
    <div onClick={handleClick} className="relative min-w-0 flex-1 cursor-pointer border-l border-card-border first:border-l-0">
      {hourMarks.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-card-border/60"
          style={{ top: (h - GRID_START_HOUR) * ROW_HEIGHT }}
        />
      ))}
      {isToday(day) && (
        <div className="absolute inset-x-0 top-0 bg-amo-lime/[0.04]" style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * ROW_HEIGHT }} />
      )}
      {positioned.map(({ event, segments }) =>
        segments.map((seg, i) => {
          const isFirst = i === 0;
          const isLast = i === segments.length - 1;
          const color = eventColor(event.colorId);
          const top = (seg.startMin / 60) * ROW_HEIGHT;
          const natural = ((seg.endMin - seg.startMin) / 60) * ROW_HEIGHT - (isLast ? 1 : 0);
          // Only the first/last segment need room for the title — see the
          // same pattern in day-grid-view.tsx.
          const height = isFirst || isLast ? Math.max(MIN_BLOCK_HEIGHT, natural) : natural;
          const link = links[event.id];
          return (
            <div
              key={`${event.id}-${i}`}
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onRequestEdit(event);
              }}
              className={`absolute flex cursor-pointer flex-col overflow-hidden px-1 py-0.5 text-[10px] font-medium leading-tight shadow-sm transition-opacity hover:opacity-90 ${isFirst ? "rounded-t" : ""} ${isLast ? "rounded-b" : ""}`}
              style={{
                top,
                height,
                left: `${(seg.col / seg.cols) * 100}%`,
                width: `${(seg.span / seg.cols) * 100}%`,
                backgroundColor: color.bg,
                color: color.fg,
              }}
              title={event.title}
            >
              {isFirst && (
                <>
                  <span className="min-w-0 whitespace-normal break-words">{event.title}</span>
                  {!event.allDay && event.start && (
                    <p className="text-[9px] font-normal opacity-90">
                      {formatTimeRange(new Date(event.start), event.end ? new Date(event.end) : null, hour12, intlLocale)}
                    </p>
                  )}
                  {link && (link.contactName || link.projectName || link.taskName) && (
                    <div className="mt-1 text-[9px] font-normal opacity-90">
                      {link.contactName && (
                        <div className="truncate">
                          <Link href={`/contacts/${link.contactId}`} onClick={(e) => e.stopPropagation()} className="underline hover:opacity-80">
                            {link.contactName}
                          </Link>
                        </div>
                      )}
                      {link.projectName && (
                        <div className="truncate">
                          <Link href={`/projects/${link.projectId}`} onClick={(e) => e.stopPropagation()} className="underline hover:opacity-80">
                            {link.projectName}
                          </Link>
                        </div>
                      )}
                      {link.taskName && (
                        <div className="truncate">
                          <Link
                            href={`/projects/${link.projectId}/tasks/${link.taskId}/edit`}
                            onClick={(e) => e.stopPropagation()}
                            className="underline hover:opacity-80"
                          >
                            {link.taskName}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })
      )}
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-start justify-center pt-6 text-xs text-soft">{labels.noEvents}</div>
      )}
    </div>
  );
}

function ThreeDayGrid({
  days,
  eventsByDay,
  links,
  dateLocale,
  hour12,
  intlLocale,
  labels,
  onRequestEdit,
  onRequestCreate,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  links: Record<string, ResolvedEventLink>;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  onRequestEdit: (event: CalendarEventSummary) => void;
  onRequestCreate: (date: Date, allDay?: boolean) => void;
  labels: CalendarLabels;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const allDayRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(45);
  const [allDayHeight, setAllDayHeight] = useState(0);

  useEffect(() => {
    if (scrollRef.current) {
      // A few px earlier than exactly 9:00, so the "9 AM" label (centered
      // on its line) doesn't get sliced in half by the scroll boundary.
      scrollRef.current.scrollTop = (9 - GRID_START_HOUR) * ROW_HEIGHT - 10;
    }
  }, []);

  const allDayByDay = eventsByDay.map((events) => events.filter((e) => e.allDay));
  const hourMarks = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  // The header/all-day rows' real heights (not a guess) are what the
  // all-day row's sticky offset and the scroller's visible-height budget
  // need — see the same pattern in day-grid-view.tsx.
  useEffect(() => {
    if (headerRef.current) setHeaderHeight(headerRef.current.getBoundingClientRect().height);
    setAllDayHeight(allDayRef.current ? allDayRef.current.getBoundingClientRect().height : 0);
  }, [days, dateLocale, labels.today, labels.tomorrow, hasAllDay, allDayByDay]);

  return (
    // Header, all-day strip, and hour grid all live inside the same
    // overflow-y-auto scroller (header/all-day made sticky) instead of
    // being three independent sibling rows — see day-grid-view.tsx for
    // why that's what keeps every row's day columns pixel-identical.
    <div className="mt-3 overflow-hidden rounded-xl border border-card-border">
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: VISIBLE_HOURS * ROW_HEIGHT + headerHeight + allDayHeight }}>
        <div ref={headerRef} className="sticky top-0 z-20 flex border-b border-card-border bg-field-bg">
          <div className="w-10 shrink-0" />
          {days.map((day, i) => (
            <div key={i} className="min-w-0 flex-1 border-l border-card-border py-1.5 text-center first:border-l-0">
              <p className="truncate px-0.5 text-[10px] font-semibold uppercase tracking-wide text-soft">
                {isToday(day) ? labels.today : isTomorrow(day) ? labels.tomorrow : format(day, "EEE", { locale: dateLocale })}
              </p>
              <p className={isToday(day) ? "text-sm font-bold text-amo-lime" : "text-sm font-medium text-ink"}>
                {format(day, "d MMM", { locale: dateLocale })}
              </p>
            </div>
          ))}
        </div>

        {hasAllDay && (
          <div ref={allDayRef} className="sticky z-20 flex border-b border-card-border bg-card-bg" style={{ top: headerHeight }}>
            <div className="w-10 shrink-0" />
            {allDayByDay.map((list, i) => (
              <div
                key={i}
                onClick={() => onRequestCreate(days[i], true)}
                className="min-w-0 flex-1 cursor-pointer space-y-0.5 border-l border-card-border p-1 first:border-l-0"
              >
                {list.map((event) => {
                  const color = eventColor(event.colorId);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestEdit(event);
                      }}
                      className="w-full whitespace-normal break-words rounded px-1 py-0.5 text-left text-[10px] font-medium"
                      style={{ backgroundColor: color.bg, color: color.fg }}
                      title={event.title}
                    >
                      {event.title}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="relative flex" style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * ROW_HEIGHT }}>
          <div className="relative w-10 shrink-0">
            {hourMarks.map((h) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] text-soft"
                style={{ top: (h - GRID_START_HOUR) * ROW_HEIGHT }}
              >
                {formatHourMark(h, hour12, intlLocale)}
              </span>
            ))}
          </div>
          {days.map((day, i) => (
            <DayColumn
              key={i}
              day={day}
              events={eventsByDay[i]}
              links={links}
              hour12={hour12}
              intlLocale={intlLocale}
              labels={labels}
              onRequestEdit={onRequestEdit}
              onRequestCreate={onRequestCreate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UpcomingTable({
  days,
  eventsByDay,
  dateLocale,
  hour12,
  intlLocale,
  labels,
  onRequestEdit,
  onRequestCreate,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  labels: CalendarLabels;
  onRequestEdit: (event: CalendarEventSummary) => void;
  onRequestCreate: (date: Date) => void;
}) {
  // Clicking the date or anywhere else in the row (except an actual event)
  // opens Add Event preset to that date, at the next half-hour from now —
  // same idea as MonthView's whole-day-cell click-to-create.
  function handleRowClick(day: Date) {
    const now = new Date();
    const target = new Date(day);
    const minutes = now.getMinutes() < 30 ? 30 : 0;
    const hours = now.getMinutes() < 30 ? now.getHours() : now.getHours() + 1;
    target.setHours(hours, minutes, 0, 0);
    onRequestCreate(target);
  }

  return (
    <div className="mt-3 max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-card-border">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {days.map((day, i) => (
            <tr key={i} onClick={() => handleRowClick(day)} className="cursor-pointer border-b border-card-border last:border-b-0 hover:bg-black/5">
              <td className="w-20 shrink-0 whitespace-nowrap border-r border-card-border bg-field-bg px-2 py-1.5 align-top font-medium text-ink">
                {format(day, "EEE d MMM", { locale: dateLocale })}
              </td>
              <td className="px-2 py-1.5 align-top">
                {eventsByDay[i].length === 0 ? (
                  <span className="text-soft">{labels.noEvents}</span>
                ) : (
                  <div className="space-y-1">
                    {eventsByDay[i].map((event) => {
                      const color = eventColor(event.colorId);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRequestEdit(event);
                          }}
                          className="flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left transition-opacity hover:opacity-90"
                          style={{ backgroundColor: color.bg, color: color.fg }}
                        >
                          <span className="w-16 shrink-0 font-bold">
                            {!event.allDay && event.start ? formatClockTime(new Date(event.start), hour12, intlLocale) : ""}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{event.title}</span>
                          <span className="shrink-0 text-[10px] opacity-90">
                            {!event.allDay && event.end ? formatClockTime(new Date(event.end), hour12, intlLocale) : ""}
                          </span>
                        </button>
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

export default function CalendarCard({
  initial,
  links: initialLinks,
  connected,
  lang,
  hour12,
  labels,
  contactOptions,
  projectOptions,
  taskOptions,
  bookingOptions,
  eventDialogLabels,
  eventViewDialogLabels,
  linkPickerLabels,
}: {
  initial: CalendarEventSummary[] | null;
  links: Record<string, ResolvedEventLink>;
  connected: boolean;
  lang: "en" | "fr";
  hour12: boolean;
  labels: CalendarLabels;
  contactOptions: LinkOption[];
  projectOptions: LinkOption[];
  taskOptions: LinkOption[];
  bookingOptions: LinkOption[];
  eventDialogLabels: EventDialogLabels;
  eventViewDialogLabels: EventViewDialogLabels;
  linkPickerLabels: { contact: string; project: string; task: string; booking: string; none: string; clear: string; searchPlaceholder: string; noResults: string };
}) {
  const [events, setEvents] = useState(initial);
  const [links, setLinks] = useState(initialLinks);
  const [loading, setLoading] = useState(false);
  const [viewTarget, setViewTarget] = useState<string | null>(null);
  const [dialogTarget, setDialogTarget] = useState<EventDialogTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/calendar");
      if (res.ok) {
        const data = (await res.json()) as { events: CalendarEventSummary[]; links?: Record<string, ResolvedEventLink> };
        setEvents(data.events);
        setLinks(data.links ?? {});
      }
    } catch {
      // Keep showing the last known list rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  function requestCreate(presetStart: Date, presetAllDay?: boolean) {
    setDialogTarget({ start: presetStart, allDay: presetAllDay });
  }

  const today = startOfDay(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const eventsByDay = days.map((day) => (events ?? []).filter((e) => e.start && isSameDay(new Date(e.start), day)));
  const gridDays = days.slice(0, 3);
  const gridEvents = eventsByDay.slice(0, 3);
  const tableDays = days.slice(3);
  const tableEvents = eventsByDay.slice(3);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      {/* Same relative-flex + absolutely-centered-link shape as the Email
          card's own header, so this button looks and sits identically to
          "Open Emails" on desktop, not just shares its classes. */}
      <div className="relative flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        {connected && (
          <Link
            href="/calendar-app"
            title={labels.openInCalendar}
            aria-label={labels.openInCalendar}
            className="btn-primary absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-lg p-1.5 shadow-sm sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
          >
            {/* Mobile: bare icon, same convention as every other page's
                header actions. Desktop/tablet (sm+) keeps the label. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 sm:hidden">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25m10.5-2.25v2.25M3.75 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v11.25m-16.5 0a2.25 2.25 0 0 0 2.25 2.25h12a2.25 2.25 0 0 0 2.25-2.25m-16.5 0v-7.5a2.25 2.25 0 0 1 2.25-2.25h12a2.25 2.25 0 0 1 2.25 2.25v7.5"
              />
            </svg>
            <span className="hidden sm:inline">{labels.openInCalendar}</span>
          </Link>
        )}
        {connected && (
          <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} hideLabelOnMobile />
        )}
      </div>
      {!connected ? (
        <p className="mt-3 text-sm text-soft">
          {labels.notConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {labels.connectInSettings}
          </Link>
        </p>
      ) : (
        <div>
          <ThreeDayGrid
            days={gridDays}
            eventsByDay={gridEvents}
            links={links}
            dateLocale={dateLocale}
            hour12={hour12}
            intlLocale={intlLocale}
            labels={labels}
            onRequestEdit={(event) => setViewTarget(event.id)}
            onRequestCreate={requestCreate}
          />
          <UpcomingTable
            days={tableDays}
            eventsByDay={tableEvents}
            dateLocale={dateLocale}
            hour12={hour12}
            intlLocale={intlLocale}
            labels={labels}
            onRequestEdit={(event) => setViewTarget(event.id)}
            onRequestCreate={requestCreate}
          />
        </div>
      )}

      <EventViewDialog
        eventId={viewTarget}
        links={viewTarget ? toLinkTargets(links[viewTarget]) : undefined}
        contacts={contactOptions}
        projects={projectOptions}
        tasks={taskOptions}
        bookings={bookingOptions}
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
        initialLinks={dialogTarget && "id" in dialogTarget ? toLinkTargets(links[dialogTarget.id]) : undefined}
        onClose={() => setDialogTarget(null)}
        onSaved={() => {
          refresh();
          setToast(eventDialogLabels.saved);
        }}
        onDeleted={() => {
          refresh();
          setToast(eventDialogLabels.deleted);
        }}
        contacts={contactOptions}
        projects={projectOptions}
        tasks={taskOptions}
        bookings={bookingOptions}
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
    </div>
  );
}
