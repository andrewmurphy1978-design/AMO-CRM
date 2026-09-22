"use client";

import { format } from "date-fns";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";

// A plain instant in time (unlike the daily-clicks chart's calendar-day
// buckets) genuinely needs the viewer's real timezone to display
// correctly — the server has none (it runs in UTC), so this renders
// client-side, where the browser's actual local timezone takes over.
export default function LastSynced({ iso, lang }: { iso: string; lang: Lang }) {
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  return <p className="text-xs text-soft">{t.marketing.statsLastSynced(format(new Date(iso), "PPp", { locale: dateLocale }))}</p>;
}
