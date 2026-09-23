"use client";

import { useEffect, useState } from "react";
import type { Locale } from "date-fns";
import { format } from "date-fns";

// Lives on the right side of the shared page header (small, right-aligned).
// Full weekday date + location at sm+; below that there's no room for
// either, so mobile gets a compact locale-formatted date ("Sep 22, 2026" /
// "22 sept. 2026") and drops the location line — the time still shows at
// both sizes.
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

  const time = now
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).format(now)
    : "--:--:--";

  return (
    <div className="text-right leading-tight text-amo-white">
      <p className="text-xs font-medium opacity-90 sm:hidden">{now ? format(now, "PP", { locale: dateLocale }) : " "}</p>
      <p className="hidden text-xs font-medium opacity-90 sm:block">
        {now ? format(now, "EEEE, MMMM d yyyy", { locale: dateLocale }) : " "}
      </p>
      <p className="font-display text-sm font-bold tabular-nums">{time}</p>
      <p className="hidden text-[10px] opacity-75 sm:block">{location}</p>
    </div>
  );
}
