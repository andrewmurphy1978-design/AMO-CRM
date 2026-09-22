"use client";

import { useEffect, useRef, useState } from "react";
import { format, isToday, isTomorrow, type Locale } from "date-fns";
import type { CalendarEventSummary } from "@/lib/google";
import { eventColor } from "@/lib/calendar-colors";
import { formatHourMark, formatTimeRange } from "@/lib/calendar-time";
import { layoutDayEvents, type TimedEvent } from "@/lib/calendar-layout";
import LinkedSummaryLine, { type LinkedSummaryValues } from "./linked-summary";

const GRID_START_HOUR = 0;
const GRID_END_HOUR = 24;
const ROW_HEIGHT = 48; // px per hour
const MIN_BLOCK_HEIGHT = 36;
const DEFAULT_SCROLL_HOUR = 7; // scroll to ~7 AM on open, like Google Calendar

// Alternating column backgrounds so days are easy to tell apart at a
// glance (plain thin borders were barely visible) — today gets its own
// stronger, solid tint that overrides the zebra stripe entirely. These are
// flat, fully opaque colors rather than translucent overlays (bg-black/5,
// bg-amo-lime/25, etc.) — a translucent tint lets the page's own
// background image show through unevenly, which is what made the columns
// look patchy/distorted instead of a clean flat fill.
function dayColumnBg(day: Date, index: number): string {
  if (isToday(day)) return "bg-[#d7f2df]";
  return index % 2 === 0 ? "bg-card-bg" : "bg-[#f0efe8]";
}

function minutesSinceGridStart(date: Date): number {
  return (date.getHours() + date.getMinutes() / 60 - GRID_START_HOUR) * 60;
}

// A single event can render as more than one stacked box (see
// layoutDayEvents in @/lib/calendar-layout for why) — only the first
// segment shows the title/time, and only the last carries the link
// button, so a widened event reads as one shape that jogs wider partway
// down rather than several unrelated boxes.
function EventBlock({
  event,
  style,
  isFirst,
  isLast,
  hour12,
  intlLocale,
  linkValues,
  contactById,
  projectById,
  taskById,
  onRequestEdit,
}: {
  event: CalendarEventSummary;
  style: React.CSSProperties;
  isFirst: boolean;
  isLast: boolean;
  hour12: boolean;
  intlLocale: string;
  linkValues: LinkedSummaryValues | undefined;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  onRequestEdit: (event: CalendarEventSummary) => void;
}) {
  const color = eventColor(event.colorId);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onRequestEdit(event);
      }}
      style={{ ...style, backgroundColor: color.bg, color: color.fg }}
      className={`absolute flex cursor-pointer flex-col overflow-hidden px-1.5 py-1 text-xs font-medium leading-tight shadow-sm transition-opacity hover:opacity-90 ${isFirst ? "rounded-t" : ""} ${isLast ? "rounded-b" : ""}`}
      title={event.title}
    >
      {isFirst && (
        <>
          <span className="min-w-0 whitespace-normal break-words">{event.title}</span>
          {!event.allDay && event.start && (
            <p className="text-[10px] font-normal opacity-90">
              {formatTimeRange(new Date(event.start), event.end ? new Date(event.end) : null, hour12, intlLocale)}
            </p>
          )}
          <LinkedSummaryLine
            values={linkValues}
            contactById={contactById}
            projectById={projectById}
            taskById={taskById}
            className="mt-3 truncate text-xs font-normal opacity-90"
          />
        </>
      )}
    </div>
  );
}

function DayColumn({
  day,
  index,
  events,
  hour12,
  intlLocale,
  links,
  contactById,
  projectById,
  taskById,
  noEventsLabel,
  onRequestEdit,
  onRequestCreate,
}: {
  day: Date;
  index: number;
  events: CalendarEventSummary[];
  hour12: boolean;
  intlLocale: string;
  links: Record<string, LinkedSummaryValues>;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  noEventsLabel: string;
  onRequestEdit: (event: CalendarEventSummary) => void;
  onRequestCreate: (date: Date) => void;
}) {
  const timed: TimedEvent<CalendarEventSummary>[] = events
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

  // Clicking anywhere in the empty part of the column (event blocks stop
  // their own click from bubbling here) opens Add Event preset to the
  // clicked date/time, snapped to the nearest 30 minutes — same idea as
  // clicking an empty slot in Google Calendar's week/day grid.
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
    <div
      onClick={handleClick}
      className={`relative min-w-0 flex-1 cursor-pointer border-l border-card-border first:border-l-0 ${dayColumnBg(day, index)}`}
    >
      {hourMarks.map((h) => (
        <div
          key={h}
          className="absolute inset-x-0 border-t border-card-border/60"
          style={{ top: (h - GRID_START_HOUR) * ROW_HEIGHT }}
        />
      ))}
      {positioned.map(({ event, segments }) =>
        segments.map((seg, i) => {
          const isFirst = i === 0;
          const isLast = i === segments.length - 1;
          const top = (seg.startMin / 60) * ROW_HEIGHT;
          const natural = ((seg.endMin - seg.startMin) / 60) * ROW_HEIGHT - (isLast ? 1 : 0);
          // Only the first/last segment need room for the title or the
          // link button — a middle segment (rare: an event widening more
          // than once) is just a plain colored strip, so it can be as
          // short as its real duration without a minimum.
          const height = isFirst || isLast ? Math.max(MIN_BLOCK_HEIGHT, natural) : natural;
          return (
            <EventBlock
              key={`${event.id}-${i}`}
              event={event}
              onRequestEdit={onRequestEdit}
              isFirst={isFirst}
              isLast={isLast}
              hour12={hour12}
              intlLocale={intlLocale}
              linkValues={links[event.id]}
              contactById={contactById}
              projectById={projectById}
              taskById={taskById}
              style={{ top, height, left: `${(seg.col / seg.cols) * 100}%`, width: `${(seg.span / seg.cols) * 100}%` }}
            />
          );
        })
      )}
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-start justify-center pt-6 text-xs text-soft">{noEventsLabel}</div>
      )}
    </div>
  );
}

export default function DayGridView({
  days,
  eventsByDay,
  links,
  contactById,
  projectById,
  taskById,
  dateLocale,
  hour12,
  intlLocale,
  todayLabel,
  tomorrowLabel,
  noEventsLabel,
  onRequestEdit,
  onRequestCreate,
}: {
  days: Date[];
  eventsByDay: CalendarEventSummary[][];
  links: Record<string, LinkedSummaryValues>;
  contactById: Record<string, string>;
  projectById: Record<string, string>;
  taskById: Record<string, string>;
  dateLocale: Locale | undefined;
  hour12: boolean;
  intlLocale: string;
  todayLabel: string;
  tomorrowLabel: string;
  noEventsLabel: string;
  onRequestEdit: (event: CalendarEventSummary) => void;
  onRequestCreate: (date: Date) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(45);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (DEFAULT_SCROLL_HOUR - GRID_START_HOUR) * ROW_HEIGHT - 10;
    }
  }, []);

  // The all-day row's sticky offset has to equal the header row's real
  // rendered height (not a guess) or it either overlaps the header or
  // leaves a gap once the header wraps to a different height (locale text,
  // font tweaks, etc.).
  useEffect(() => {
    if (headerRef.current) setHeaderHeight(headerRef.current.getBoundingClientRect().height);
  }, [days, dateLocale, todayLabel, tomorrowLabel]);

  const allDayByDay = eventsByDay.map((events) => events.filter((e) => e.allDay));
  const hourMarks = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i);
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    // Header, all-day strip, and hour grid used to be three independent
    // sibling flex rows — only the hour grid lived inside the
    // overflow-y-auto scroller. That let the two contexts disagree on how
    // much width each row actually had (the scroller reserves space for its
    // own scrollbar; the header/all-day rows above it don't), so the last
    // day column could end up a few pixels narrower or clipped in the
    // header than in the body. Putting all three inside ONE scroll
    // container — with the header/all-day rows made `sticky` so they still
    // look fixed while only the hours scroll — means every row is measured
    // in the exact same width context, so the columns can't drift apart.
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-card-border">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={headerRef} className="sticky top-0 z-20 flex border-b border-card-border bg-card-bg">
          <div className="w-14 shrink-0 bg-field-bg" />
          {days.map((day, i) => (
            <div key={i} className={`min-w-0 flex-1 border-l border-card-border py-1.5 text-center first:border-l-0 ${dayColumnBg(day, i)}`}>
              <p className="truncate px-0.5 text-[10px] font-semibold uppercase tracking-wide text-soft">
                {isToday(day) ? todayLabel : isTomorrow(day) ? tomorrowLabel : format(day, "EEE", { locale: dateLocale })}
              </p>
              <p className={isToday(day) ? "text-sm font-bold text-amo-lime" : "text-sm font-medium text-ink"}>
                {format(day, "d MMM", { locale: dateLocale })}
              </p>
            </div>
          ))}
        </div>

        {hasAllDay && (
          <div className="sticky z-20 flex border-b border-card-border" style={{ top: headerHeight }}>
            <div className="w-14 shrink-0 bg-field-bg" />
            {allDayByDay.map((list, i) => (
              <div key={i} className={`min-w-0 flex-1 space-y-0.5 border-l border-card-border p-1 first:border-l-0 ${dayColumnBg(days[i], i)}`}>
                {list.map((event) => {
                  const color = eventColor(event.colorId);
                  return (
                    <div
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestEdit(event);
                      }}
                      className="flex cursor-pointer items-start gap-1 overflow-hidden rounded px-1 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: color.bg, color: color.fg }}
                      title={event.title}
                    >
                      <span className="min-w-0 flex-1 whitespace-normal break-words">{event.title}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="relative flex" style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * ROW_HEIGHT }}>
          <div className="relative w-14 shrink-0 bg-field-bg">
            {hourMarks.map((h) => (
              <span
                key={h}
                className="absolute right-1 -translate-y-1/2 text-xs font-medium text-soft"
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
              index={i}
              events={eventsByDay[i]}
              hour12={hour12}
              intlLocale={intlLocale}
              links={links}
              contactById={contactById}
              projectById={projectById}
              taskById={taskById}
              noEventsLabel={noEventsLabel}
              onRequestEdit={onRequestEdit}
              onRequestCreate={onRequestCreate}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
