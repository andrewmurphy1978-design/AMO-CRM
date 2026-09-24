"use client";

import { useEffect, useState } from "react";
import type { Locale } from "date-fns";
import { format } from "date-fns";

// Lives on the right side of the shared page header (small, right-aligned).
// Full weekday date + time-with-seconds + location at sm+, unchanged.
// Below that there's no room for any of that — every page's header is
// this tight on mobile, not just Email's — so mobile gets a short
// no-year date ("Sep 24" / "24 sept.") and a no-seconds time, and drops
// the location line entirely.
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

  const timeWithSeconds = now
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).format(now)
    : "--:--:--";
  const timeCompact = now
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12 }).format(now)
    : "--:--";
  // French dates read day-before-month ("24 sept."), English month-before-day
  // ("Sep 24") — getDateLocale returns undefined for English, the real `fr`
  // locale object for French, so that alone is enough to pick the order.
  const compactDateFormat = dateLocale ? "d MMM" : "MMM d";

  return (
    <div className="text-right leading-tight text-amo-white">
      <p className="text-xs font-medium opacity-90 sm:hidden">{now ? format(now, compactDateFormat, { locale: dateLocale }) : " "}</p>
      <p className="hidden text-xs font-medium opacity-90 sm:block">
        {now ? format(now, "EEEE, MMMM d yyyy", { locale: dateLocale }) : " "}
      </p>
      <p className="font-display text-sm font-bold tabular-nums sm:hidden">{timeCompact}</p>
      <p className="hidden font-display text-sm font-bold tabular-nums sm:block">{timeWithSeconds}</p>
      <p className="hidden text-[10px] opacity-75 sm:block">{location}</p>
    </div>
  );
}
