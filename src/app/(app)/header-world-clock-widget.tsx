"use client";

import { useEffect, useRef, useState } from "react";
import { zoneShortLabel } from "@/lib/timezones";

// Replaces the old dashboard-wide World Clocks card (world-clocks.tsx) —
// the compact pill shows the 2 zones picked in Settings (see
// src/lib/world-clock-zones.ts), and clicking it opens every zone the
// user picked (up to 8) as a drop-down, same idea as the Weather widget
// right next to it.
export default function HeaderWorldClockWidget({
  headerZones,
  allZones,
  hour12,
  title,
}: {
  headerZones: string[];
  allZones: string[];
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

  if (headerZones.length === 0) return null;

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 rounded-lg bg-white/10 px-2.5 py-1.5 text-amo-white transition-colors hover:bg-white/15"
      >
        {headerZones.map((zone) => (
          <span key={zone} className="text-center leading-tight">
            <span className="block text-[9px] uppercase tracking-wide opacity-75">
              {zoneShortLabel(zone)}
            </span>
            <span className="block font-display text-sm font-bold tabular-nums">
              {timeIn(zone)}
            </span>
          </span>
        ))}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-card-border bg-card-bg p-4 text-left shadow-lg">
          <h3 className="font-display text-sm font-semibold text-ink">{title}</h3>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {allZones.map((zone) => (
              <div
                key={zone}
                className="rounded-lg bg-black/5 px-1.5 py-1.5 text-center"
              >
                <p className="text-[10px] font-medium uppercase tracking-wide text-soft">
                  {zoneShortLabel(zone)}
                </p>
                <p className="font-display text-sm font-semibold text-ink">
                  {timeIn(zone)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
