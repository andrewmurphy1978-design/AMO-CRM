import type { Locale } from "date-fns";
import DateTimeCard from "./date-time-card";

// Shared sticky header for every page under (app) — dark green like the
// sidebar, title on the left, the Date/Time/Location card on the right.
// No logo here: the sidebar already shows it (full lockup when expanded,
// badge when collapsed), so repeating it in every page header is
// redundant.
export default function PageHeader({
  title,
  hour12,
  dateLocale,
  location,
}: {
  title: string;
  hour12: boolean;
  dateLocale: Locale | undefined;
  location: string;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-4 bg-amo-green px-4 py-3 sm:-mx-8 sm:-mt-8 sm:px-8">
      <h1 className="font-display text-xl font-semibold text-amo-white sm:text-2xl">{title}</h1>
      <DateTimeCard hour12={hour12} dateLocale={dateLocale} location={location} />
    </header>
  );
}
