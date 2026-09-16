"use client";

import { useEffect, useState } from "react";
import type { Locale } from "date-fns";
import { format } from "date-fns";

export default function DateTimeCard({
  hour12,
  dateLocale,
  location,
}: {
  hour12: boolean;
  dateLocale: Locale | undefined;
  location: string;
}) {
  const [now, setNow] = useState<Date | null>(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <p className="font-display text-lg font-semibold text-ink">
        {now ? format(now, "EEEE, MMMM d, yyyy", { locale: dateLocale }) : " "}
      </p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">
        {now
          ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).format(
              now
            )
          : "--:--:--"}
      </p>
      <p className="mt-1 text-sm text-soft">{location}</p>
    </section>
  );
}
