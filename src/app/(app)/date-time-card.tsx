"use client";

import { useEffect, useState } from "react";
import type { Locale } from "date-fns";
import { format } from "date-fns";

// Lives on the right side of the shared page header (small, right-aligned).
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
    <div className="hidden text-right leading-tight text-amo-white sm:block">
      <p className="text-xs font-medium opacity-90">
        {now ? format(now, "EEEE, MMMM d yyyy", { locale: dateLocale }) : " "}
      </p>
      <p className="font-display text-sm font-bold tabular-nums">
        {now
          ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).format(
              now
            )
          : "--:--:--"}
      </p>
      <p className="text-[10px] opacity-75">{location}</p>
    </div>
  );
}
