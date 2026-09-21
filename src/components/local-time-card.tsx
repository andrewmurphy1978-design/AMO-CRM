"use client";

import { useEffect, useState } from "react";

// A generic "current time in this time zone" preview: left-aligned, its own
// label (not a place name), full-length date, no UTC offset line. Shared
// between the Contact Edit form (beside the Time Zone field) and the
// Contact Info page (read-only equivalent) so they render identically —
// distinct from ContactTimezoneCard, which shows a real place name,
// right-aligned, with a short date + UTC offset.
export default function LocalTimeCard({
  timeZone,
  hour12,
  lang,
  label,
  className = "",
}: {
  timeZone: string;
  hour12: boolean;
  lang: "en" | "fr";
  label: string;
  className?: string;
}) {
  const [now, setNow] = useState<Date | null>(() => new Date());
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`relative flex flex-col justify-center overflow-hidden rounded-2xl border border-card-border bg-card-bg px-4 py-3 text-left shadow-sm ${className}`}
    >
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">{label}</p>
      <p className="font-display text-lg font-bold tabular-nums text-ink">
        {now
          ? new Intl.DateTimeFormat(intlLocale, { timeZone, hour: "2-digit", minute: "2-digit", hour12 }).format(now)
          : "--:--"}
      </p>
      <p className="text-xs text-soft">
        {now
          ? new Intl.DateTimeFormat(intlLocale, { timeZone, weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(
              now
            )
          : " "}
      </p>
    </div>
  );
}
