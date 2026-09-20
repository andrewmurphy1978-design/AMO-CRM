"use client";

import { useEffect, useState } from "react";
import { utcOffsetLabel } from "@/lib/timezone";

// Small top-right card on the Contact detail page showing the contact's
// own local date/time — derived from their primary address's country/state,
// not the viewer's — plus that zone's current UTC offset (already reflects
// DST, since it's computed from "now").
export default function ContactTimezoneCard({
  timeZone,
  locationLabel,
  hour12,
  lang,
}: {
  timeZone: string;
  locationLabel: string;
  hour12: boolean;
  lang: "en" | "fr";
}) {
  const [now, setNow] = useState<Date | null>(() => new Date());
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg px-4 py-3 text-right shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-soft">{locationLabel}</p>
      <p className="font-display text-lg font-bold tabular-nums text-ink">
        {now
          ? new Intl.DateTimeFormat(intlLocale, { timeZone, hour: "2-digit", minute: "2-digit", hour12 }).format(now)
          : "--:--"}
      </p>
      <p className="text-xs text-soft">
        {now
          ? new Intl.DateTimeFormat(intlLocale, { timeZone, weekday: "short", month: "short", day: "numeric" }).format(
              now
            )
          : " "}
        {" · "}
        {now ? utcOffsetLabel(timeZone, now) : ""}
      </p>
    </div>
  );
}
