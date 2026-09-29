"use client";

import { useEffect, useRef, useState } from "react";
import { zoneShortLabel, offsetMinutes, formatOffsetShort } from "@/lib/timezones";

// Replaces the old dashboard-wide World Clocks card (world-clocks.tsx) —
// the compact pill shows the 2 zones picked in Settings (see
// src/lib/world-clock-zones.ts), and clicking it opens every zone the
// user picked (up to 9) as a drop-down, same idea as the Weather widget
// right next to it.
export default function HeaderWorldClockWidget({
  headerZones,
  allZones,
  mobileZone,
  hour12,
  title,
}: {
  headerZones: string[];
  allZones: string[];
  // Which one of headerZones shows on mobile (there's only room for one) —
  // see Settings' "Header clock on mobile" picker. Falls back to the first
  // header zone when unset/not found.
  mobileZone: string | null;
  hour12: boolean;
  title: string;
}) {
  const [now, setNow] = useState<Date | null>(() => new Date());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function timeIn(zone: string): string {
    return now
      ? new Intl.DateTimeFormat("en-US", {
          timeZone: zone,
          hour: "2-digit",
          minute: "2-digit",
          hour12,
        }).format(now)
      : "--:--";
  }

  function offsetIn(zone: string): string {
    return now ? formatOffsetShort(offsetMinutes(zone, now)) : "";
  }

  if (headerZones.length === 0) return null;

  // Mobile only has room for one zone — the one chosen in Settings,
  // falling back to the first when unset or no longer one of the header
  // zones. Desktop still shows every header zone.
  const mobile = headerZones.find((z) => z === mobileZone) ?? headerZones[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-amo-white transition-colors hover:bg-white/15 sm:gap-3"
      >
        <span className="flex items-baseline gap-1 whitespace-nowrap text-xs font-bold sm:hidden">
          <span className="uppercase tracking-wide opacity-75">{zoneShortLabel(mobile)}</span>
          <span className="font-display tabular-nums">{timeIn(mobile)}</span>
        </span>
        {headerZones.map((zone) => (
          <span key={zone} className="hidden max-w-[5.5rem] min-w-0 text-center leading-tight sm:block">
            <span className="block truncate text-[9px] uppercase tracking-wide opacity-75">
              {zoneShortLabel(zone)}
            </span>
            <span className="block truncate font-display text-sm font-bold tabular-nums">
              {timeIn(zone)}
            </span>
          </span>
        ))}
      </button>
      {open && (
        <div
          className="fixed inset-4 z-40 m-auto h-fit max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[26rem] overflow-y-auto rounded-xl border border-card-border bg-card-bg p-4 text-left shadow-lg sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:m-0 sm:mt-2 sm:h-auto sm:max-h-none sm:w-[26rem] sm:max-w-none"
        >
          <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {allZones.map((zone) => (
              <div
                key={zone}
                className="min-w-0 overflow-hidden rounded-lg bg-black/5 px-2 py-1.5 text-center"
              >
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-soft">
                  {zoneShortLabel(zone)}
                </p>
                <p className="truncate font-display text-sm font-semibold text-ink">
                  {timeIn(zone)}
                </p>
                <p className="truncate text-[9px] font-medium text-soft/80">
                  {offsetIn(zone)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
