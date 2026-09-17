"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format, isSameDay, isToday, isTomorrow, startOfDay, type Locale } from "date-fns";
import RefreshButton from "./refresh-button";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatClockTime, formatHourMark, formatTimeRange } from "@/lib/calendar-time";

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

// Pre-resolved (not raw ids) since the Dashboard card, unlike the full
// Calendar page, doesn't ship full contacts/projects/tasks lists to the
// client just to look three names up — the server resolves them once.
export interface ResolvedEventLink {
  contactId: string;
  contactName: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
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

interface TimedEvent {
  event: CalendarEventSummary;
  startMin: number; // minutes since grid start, clamped to the grid range
  endMin: number;
}

interface PositionedEvent extends TimedEvent {
  col: number;
  cols: number;
}

// Places overlapping events side by side (like Google Calendar) instead
// of stacking them on top of each other. Standard column-packing
// algorithm: walk events in start order, put each in the first column
// whose last event has already ended, and close out a "cluster" (which
// shares one column count) once no event is still open.
function layoutDayEvents(events: TimedEvent[]): PositionedEvent[] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const columns: TimedEvent[][] = [];
  const clusterAssignments: { event: TimedEvent; col: number }[] = [];
  const result: PositionedEvent[] = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (clusterAssignments.length === 0) return;
    const cols = columns.length;
    for (const { event, col } of clusterAssignments) result.push({ ...event, col, cols });
    columns.length = 0;
    clusterAssignments.length = 0;
  }

  for (const ev of sorted) {
    if (ev.startMin >= clusterEnd) {
      flushCluster();
      clusterEnd = -Infinity;
    }
    let placedCol = -1;
    for (let c = 0; c < columns.length; c++) {
      const last = columns[c][columns[c].length - 1];
      if (last.endMin <= ev.startMin) {
        placedCol = c;
        break;
      }
    }
    if (placedCol === -1) {
      columns.push([]);
      placedCol = columns.length - 1;
    }
    columns[placedCol].push(ev);
    clusterAssignments.push({ event: ev, col: placedCol });
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flushCluster();
  return result;
}

function DayColumn({
  day,
  events,
  links,
  hour12,
  intlLocale,
  labels,
}: {
  day: Date;
  events: CalendarEventSummary[];
  links: Record<string, ResolvedEventLink>;
  hour12: boolean;
  intlLocale: string;
  labels: CalendarLabels;
}) {
  const router = useRouter();
  const timed: TimedEvent[] = events
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

  return (
    <div className="relative min-w-0 flex-1 border-l border-card-border first:border-l-0">
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
      {positioned.map(({ event, startMin, endMin, col, cols }) => {
        const color = eventColor(event.colorId);
        const top = (startMin / 60) * ROW_HEIGHT;
        const height = Math.max(MIN_BLOCK_HEIGHT, ((endMin - startMin) / 60) * ROW_HEIGHT - 1);
        const link = links[event.id];
        return (
          <div
            key={event.id}
            role="button"
            tabIndex={0}
            onClick={() => router.push("/calendar")}
            className="absolute flex cursor-pointer flex-col overflow-hidden rounded px-1 py-0.5 text-[10px] font-medium leading-tight shadow-sm transition-opacity hover:opacity-90"
            style={{
              top,
              height,
              left: `${(col / cols) * 100}%`,
              width: `${100 / cols}%`,
              backgroundColor: color.bg,
              color: color.fg,
            }}
            title={event.title}
          >
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
          </div>
        );
      })}
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
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  links: Record<string, ResolvedEventLink>;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  labels: CalendarLabels;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-card-border">
      {/* Day headers */}
      <div className="flex border-b border-card-border bg-field-bg">
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

      {/* All-day strip */}
      {hasAllDay && (
        <div className="flex border-b border-card-border">
          <div className="w-10 shrink-0" />
          {allDayByDay.map((list, i) => (
            <div key={i} className="min-w-0 flex-1 space-y-0.5 border-l border-card-border p-1 first:border-l-0">
              {list.map((event) => {
                const color = eventColor(event.colorId);
                return (
                  <div
                    key={event.id}
                    className="w-full whitespace-normal break-words rounded px-1 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: color.bg, color: color.fg }}
                    title={event.title}
                  >
                    {event.title}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable hourly grid */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: VISIBLE_HOURS * ROW_HEIGHT }}>
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
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  labels: CalendarLabels;
}) {
  return (
    <div className="mt-3 max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-card-border">
      <table className="w-full border-collapse text-xs">
        <tbody>
          {days.map((day, i) => (
            <tr key={i} className="border-b border-card-border last:border-b-0">
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
                        <Link
                          key={event.id}
                          href="/calendar"
                          className="flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 transition-opacity hover:opacity-90"
                          style={{ backgroundColor: color.bg, color: color.fg }}
                        >
                          <span className="w-16 shrink-0 font-bold">
                            {!event.allDay && event.start ? formatClockTime(new Date(event.start), hour12, intlLocale) : ""}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{event.title}</span>
                          <span className="shrink-0 text-[10px] opacity-90">
                            {!event.allDay && event.end ? formatClockTime(new Date(event.end), hour12, intlLocale) : ""}
                          </span>
                        </Link>
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
}: {
  initial: CalendarEventSummary[] | null;
  links: Record<string, ResolvedEventLink>;
  connected: boolean;
  lang: "en" | "fr";
  hour12: boolean;
  labels: CalendarLabels;
}) {
  const [events, setEvents] = useState(initial);
  const [links, setLinks] = useState(initialLinks);
  const [loading, setLoading] = useState(false);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

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

  const today = startOfDay(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const eventsByDay = days.map((day) => (events ?? []).filter((e) => e.start && isSameDay(new Date(e.start), day)));
  const gridDays = days.slice(0, 3);
  const gridEvents = eventsByDay.slice(0, 3);
  const tableDays = days.slice(3);
  const tableEvents = eventsByDay.slice(3);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        {connected && (
          <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
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
          />
          <UpcomingTable
            days={tableDays}
            eventsByDay={tableEvents}
            dateLocale={dateLocale}
            hour12={hour12}
            intlLocale={intlLocale}
            labels={labels}
          />
          <div className="mt-3 border-t border-card-border pt-3 text-xs">
            <a
              href="https://calendar.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-emerald-700 hover:underline"
            >
              {labels.openInCalendar}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
