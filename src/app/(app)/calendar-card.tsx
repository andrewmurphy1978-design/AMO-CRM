"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addDays, format, isSameDay, isToday, isTomorrow, startOfDay, type Locale } from "date-fns";
import RefreshButton from "./refresh-button";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { CalendarEventSummary } from "@/lib/google";

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

// Google Calendar's own named event colors (colorId -> hex), so events
// look the same here as they do in Google Calendar itself. No colorId on
// an event means it uses the calendar's own color, which for a primary
// calendar is Google's default blue.
const GOOGLE_EVENT_COLORS: Record<string, { bg: string; fg: string }> = {
  "1": { bg: "#7986cb", fg: "#fff" }, // Lavender
  "2": { bg: "#33b679", fg: "#fff" }, // Sage
  "3": { bg: "#8e24aa", fg: "#fff" }, // Grape
  "4": { bg: "#e67c73", fg: "#fff" }, // Flamingo
  "5": { bg: "#f6bf26", fg: "#000" }, // Banana
  "6": { bg: "#f4511e", fg: "#fff" }, // Tangerine
  "7": { bg: "#039be5", fg: "#fff" }, // Peacock
  "8": { bg: "#616161", fg: "#fff" }, // Graphite
  "9": { bg: "#3f51b5", fg: "#fff" }, // Blueberry
  "10": { bg: "#0b8043", fg: "#fff" }, // Basil
  "11": { bg: "#d50000", fg: "#fff" }, // Tomato
};
const DEFAULT_EVENT_COLOR = { bg: "#4285f4", fg: "#fff" }; // Google's default calendar blue

function eventColor(colorId: string | null): { bg: string; fg: string } {
  return (colorId && GOOGLE_EVENT_COLORS[colorId]) || DEFAULT_EVENT_COLOR;
}

const GRID_START_HOUR = 6; // grid content starts at 6 AM...
const GRID_END_HOUR = 22; // ...through 10 PM, scrollable
const VISIBLE_HOURS = 8; // ...but only ~9 AM-5 PM is visible without scrolling
const ROW_HEIGHT = 48; // px per hour
const MIN_BLOCK_HEIGHT = 18; // px — keeps very short events tappable/legible

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
  labels,
}: {
  day: Date;
  events: CalendarEventSummary[];
  labels: CalendarLabels;
}) {
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
    <div className="relative flex-1 border-l border-card-border first:border-l-0">
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
        return (
          <div
            key={event.id}
            className="absolute overflow-hidden rounded px-1 py-0.5 text-[10px] font-medium leading-tight shadow-sm"
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
            {event.title}
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
  dateLocale,
  labels,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  dateLocale: Locale | undefined;
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
          <div key={i} className="flex-1 border-l border-card-border py-1.5 text-center first:border-l-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
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
            <div key={i} className="flex-1 space-y-0.5 border-l border-card-border p-1 first:border-l-0">
              {list.map((event) => {
                const color = eventColor(event.colorId);
                return (
                  <div
                    key={event.id}
                    className="truncate rounded px-1 py-0.5 text-[10px] font-medium"
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
                {format(new Date(2000, 0, 1, h), "h a", { locale: dateLocale })}
              </span>
            ))}
          </div>
          {days.map((day, i) => (
            <DayColumn key={i} day={day} events={eventsByDay[i]} labels={labels} />
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
  labels,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  dateLocale: Locale | undefined;
  labels: CalendarLabels;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-card-border">
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
                        <div key={event.id} className="flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color.bg }} />
                          <span className="text-ink">{event.title}</span>
                          {!event.allDay && event.start && (
                            <span className="text-soft">{format(new Date(event.start), "p", { locale: dateLocale })}</span>
                          )}
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

export default function CalendarCard({
  initial,
  connected,
  lang,
  labels,
}: {
  initial: CalendarEventSummary[] | null;
  connected: boolean;
  lang: "en" | "fr";
  labels: CalendarLabels;
}) {
  const [events, setEvents] = useState(initial);
  const [loading, setLoading] = useState(false);
  const dateLocale = getDateLocale(lang);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/calendar");
      if (res.ok) setEvents(((await res.json()) as { events: CalendarEventSummary[] }).events);
    } catch {
      // Keep showing the last known list rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  const today = startOfDay(new Date());
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const eventsByDay = week.map((day) => (events ?? []).filter((e) => e.start && isSameDay(new Date(e.start), day)));
  const gridDays = week.slice(0, 3);
  const gridEvents = eventsByDay.slice(0, 3);
  const tableDays = week.slice(3);
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
          <ThreeDayGrid days={gridDays} eventsByDay={gridEvents} dateLocale={dateLocale} labels={labels} />
          <UpcomingTable days={tableDays} eventsByDay={tableEvents} dateLocale={dateLocale} labels={labels} />
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
