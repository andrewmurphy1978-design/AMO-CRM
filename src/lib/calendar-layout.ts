// Shared column-packing layout for side-by-side overlapping calendar
// events, used by both the full Calendar page (day-grid-view.tsx) and the
// Dashboard's 3-day calendar-card.tsx.
export interface TimedEvent<T> {
  event: T;
  startMin: number;
  endMin: number;
}

// An event can need more than one box: a long event that only briefly
// overlaps a handful of short ones (e.g. a 7:00-14:00 booking overlapping
// six 15-minute morning drop-offs around 9:00) should stay narrow *only*
// during that overlap and widen once the short events end, instead of
// being locked at the crowd's peak width for its whole duration — this is
// the same "jog wider" behavior Google Calendar uses. Each segment keeps
// the event's column fixed (so its left edge never jumps) and only the
// width (span) changes between segments.
export interface EventSegment {
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
  span: number;
}

export interface PositionedEvent<T> extends TimedEvent<T> {
  segments: EventSegment[];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Standard interval-graph column-packing: walk events in start order,
// place each in the first column whose last event has already ended, and
// close out a "cluster" (a run of mutually-touching events sharing one
// column count) once nothing is still open. Each event keeps one fixed
// column for its whole duration; layoutSegments (below) then works out
// how wide it can be at each point in time.
function assignColumns<T>(events: TimedEvent<T>[]): { item: TimedEvent<T>; col: number; cols: number }[] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const columns: TimedEvent<T>[][] = [];
  const clusterAssignments: { item: TimedEvent<T>; col: number }[] = [];
  const result: { item: TimedEvent<T>; col: number; cols: number }[] = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (clusterAssignments.length === 0) return;
    const cols = columns.length;
    for (const { item, col } of clusterAssignments) result.push({ item, col, cols });
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
    clusterAssignments.push({ item: ev, col: placedCol });
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flushCluster();
  return result;
}

export function layoutDayEvents<T>(events: TimedEvent<T>[]): PositionedEvent<T>[] {
  const placed = assignColumns(events);

  return placed.map(({ item, col, cols }) => {
    // Every start/end instant (of any placed event) that falls inside
    // this event's own span is a point where the set of concurrently
    // active neighbors — and therefore how far this event can widen —
    // may change.
    const breakpoints = new Set<number>([item.startMin, item.endMin]);
    for (const other of placed) {
      if (other.item.startMin > item.startMin && other.item.startMin < item.endMin) breakpoints.add(other.item.startMin);
      if (other.item.endMin > item.startMin && other.item.endMin < item.endMin) breakpoints.add(other.item.endMin);
    }
    const points = [...breakpoints].sort((a, b) => a - b);

    const rawSegments: EventSegment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const segStart = points[i];
      const segEnd = points[i + 1];
      let span = 1;
      for (let c = col + 1; c < cols; c++) {
        const blocked = placed.some(
          (other) => other.col === c && other.item !== item && overlaps(other.item.startMin, other.item.endMin, segStart, segEnd)
        );
        if (blocked) break;
        span++;
      }
      rawSegments.push({ startMin: segStart, endMin: segEnd, col, cols, span });
    }

    // Merge consecutive segments that ended up with the same width so a
    // plain (non-widening) event still renders as a single box.
    const segments: EventSegment[] = [];
    for (const seg of rawSegments) {
      const prev = segments[segments.length - 1];
      if (prev && prev.span === seg.span) prev.endMin = seg.endMin;
      else segments.push({ ...seg });
    }

    return { ...item, segments };
  });
}
