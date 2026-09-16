import type { Locale } from "date-fns";
import DateTimeCard from "./date-time-card";

// Shared sticky header for every page under (app) — dark green like the
// sidebar, the Date/Time/Location card on the right. No logo on most
// pages: the sidebar already shows it, so repeating it would be
// redundant. The Dashboard is the one exception — its own sidebar entry
// hides the logo (see Sidebar's hideLogo prop), and shows the full AMO
// lockup here instead, with the title centered between it and the card.
export default function PageHeader({
  title,
  hour12,
  dateLocale,
  location,
  logoUrl,
}: {
  title: string;
  hour12: boolean;
  dateLocale: Locale | undefined;
  location: string;
  logoUrl?: string;
}) {
  if (logoUrl) {
    return (
      <header className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-4 bg-amo-green px-4 py-3 sm:-mx-8 sm:-mt-8 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="Andrew Murphy Online" className="h-auto w-36 shrink-0 object-contain sm:w-56" />
        <h1 className="absolute left-1/2 -translate-x-1/2 font-display text-xl font-semibold text-amo-white sm:text-2xl">
          {title}
        </h1>
        <DateTimeCard hour12={hour12} dateLocale={dateLocale} location={location} />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-4 bg-amo-green px-4 py-3 sm:-mx-8 sm:-mt-8 sm:px-8">
      <h1 className="font-display text-xl font-semibold text-amo-white sm:text-2xl">{title}</h1>
      <DateTimeCard hour12={hour12} dateLocale={dateLocale} location={location} />
    </header>
  );
}
