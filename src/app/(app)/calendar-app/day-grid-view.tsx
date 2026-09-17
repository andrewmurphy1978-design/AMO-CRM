"use client";

import { useEffect, useRef } from "react";
import { format, isToday, isTomorrow, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatHourMark } from "@/lib/calendar-time";

const GRID_START_HOUR = 0;
const GRID_END_HOUR = 24;
const ROW_HEIGHT = 48; // px per hour
const MIN_BLOCK_HEIGHT = 18;
const DEFAULT_SCROLL_HOUR = 7; // scroll to ~7 AM on open, like Google Calendar

function minutesSinceGridStart(date: Date): number {
  return (date.getHours() + date.getMinutes() / 60 - GRID_START_HOUR) * 60;
}

interface TimedEvent {
  event: CalendarEventSummary;
  startMin: number;
  endMin: number;
}

interface PositionedEvent extends TimedEvent {
  col: number;
  cols: number;
}

// Standard column-packing algorithm for side-by-side overlapping events —
// same approach as the Dashboard's calendar-card.tsx.
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

function EventBlock({
  event,
  style,
  onRequestLink,
}: {
  event: CalendarEventSummary;
  style: React.CSSProperties;
  onRequestLink: (event: CalendarEventSummary) => void;
}) {
  const color = eventColor(event.colorId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank", "noopener,noreferrer")}
      style={{ ...style, backgroundColor: color.bg, color: color.fg }}
      className="absolute flex cursor-pointer items-start gap-1 overflow-hidden rounded px-1 py-0.5 text-[10px] font-medium leading-tight shadow-sm transition-opacity hover:opacity-90"
      title={event.title}
    >
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRequestLink(event);
        }}
        className="shrink-0 opacity-80 hover:opacity-100"
        title="Link"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-2.5 w-2.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      </button>
    </div>
  );
}

function DayColumn({
  day,
  events,
  noEventsLabel,
  onRequestLink,
}: {
  day: Date;
  events: CalendarEventSummary[];
  noEventsLabel: string;
  onRequestLink: (event: CalendarEventSummary) => void;
}) {
  const timed: TimedEvent[] = events
    .filter((e) => !e.allDay && e.start)
    .map((e) => {
      const start = new Date(e.start as string);
      const end = e.end ? new Date(e.end) : new Date(start.getTime() + 30 * 60 * 1000);
      const gridEnd = (GRID_END_HOUR - GRID_START_HOUR) * 60;
      return {
        event: e,
        startMin: Math.max(0, minutesSinceGridStart(start)),
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
        <div
          className="absolute inset-x-0 top-0 bg-amo-lime/[0.04]"
          style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * ROW_HEIGHT }}
        />
      )}
      {positioned.map(({ event, startMin, endMin, col, cols }) => {
        const top = (startMin / 60) * ROW_HEIGHT;
        const height = Math.max(MIN_BLOCK_HEIGHT, ((endMin - startMin) / 60) * ROW_HEIGHT - 1);
        return (
          <EventBlock
            key={event.id}
            event={event}
            onRequestLink={onRequestLink}
            style={{ top, height, left: `${(col / cols) * 100}%`, width: `${100 / cols}%` }}
          />
        );
      })}
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-start justify-center pt-6 text-xs text-soft">{noEventsLabel}</div>
      )}
    </div>
  );
}

export default function DayGridView({
  days,
  eventsByDay,
  dateLocale,
  hour12,
  intlLocale,
  todayLabel,
  tomorrowLabel,
  noEventsLabel,
  onRequestLink,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  todayLabel: string;
  tomorrowLabel: string;
  noEventsLabel: string;
  onRequestLink: (event: CalendarEventSummary) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (DEFAULT_SCROLL_HOUR - GRID_START_HOUR) * ROW_HEIGHT - 10;
    }
  }, []);

  const allDayByDay = eventsByDay.map((events) => events.filter((e) => e.allDay));
  const hourMarks = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-card-border">
      <div className="flex shrink-0 border-b border-card-border bg-field-bg">
        <div className="w-12 shrink-0" />
        {days.map((day, i) => (
          <div key={i} className="flex-1 border-l border-card-border py-1.5 text-center first:border-l-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">
              {isToday(day) ? todayLabel : isTomorrow(day) ? tomorrowLabel : format(day, "EEE", { locale: dateLocale })}
            </p>
            <p className={isToday(day) ? "text-sm font-bold text-amo-lime" : "text-sm font-medium text-ink"}>
              {format(day, "d MMM", { locale: dateLocale })}
            </p>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div className="flex shrink-0 border-b border-card-border">
          <div className="w-12 shrink-0" />
          {allDayByDay.map((list, i) => (
            <div key={i} className="flex-1 space-y-0.5 border-l border-card-border p-1 first:border-l-0">
              {list.map((event) => {
                const color = eventColor(event.colorId);
                return (
                  <div
                    key={event.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => event.htmlLink && window.open(event.htmlLink, "_blank", "noopener,noreferrer")}
                    className="flex cursor-pointer items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium"
                    style={{ backgroundColor: color.bg, color: color.fg }}
                    title={event.title}
                  >
                    <span className="min-w-0 flex-1 truncate">{event.title}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * ROW_HEIGHT }}>
          <div className="relative w-12 shrink-0">
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
            <DayColumn key={i} day={day} events={eventsByDay[i]} noEventsLabel={noEventsLabel} onRequestLink={onRequestLink} />
          ))}
        </div>
      </div>
    </div>
  );
}
