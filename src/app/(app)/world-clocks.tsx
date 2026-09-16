"use client";

import { useEffect, useState } from "react";

const CLOCKS = [
  { label: "Eastern", timeZone: "America/Toronto" },
  { label: "Central", timeZone: "America/Chicago" },
  { label: "Rockies", timeZone: "America/Denver" },
  { label: "Pacific", timeZone: "America/Vancouver" },
  { label: "London", timeZone: "Europe/London" },
  { label: "Paris", timeZone: "Europe/Paris" },
  { label: "Sydney", timeZone: "Australia/Sydney" },
  { label: "New Zealand", timeZone: "Pacific/Auckland" },
] as const;

export default function WorldClocks({ title, hour12 = false }: { title: string; hour12?: boolean }) {
  const [now, setNow] = useState<Date | null>(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {CLOCKS.map((clock) => (
          <div key={clock.timeZone} className="rounded-lg bg-black/5 px-1.5 py-1.5 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-soft">{clock.label}</p>
            <p className="font-display text-sm font-semibold text-ink">
              {now
                ? new Intl.DateTimeFormat("en-US", {
                    timeZone: clock.timeZone,
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12,
                  }).format(now)
                : "--:--"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
