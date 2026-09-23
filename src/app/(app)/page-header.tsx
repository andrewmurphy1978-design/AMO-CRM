import type { ReactNode } from "react";
import type { Locale } from "date-fns";
import Link from "next/link";
import DateTimeCard from "./date-time-card";

// A detail page's contextual title, e.g. client name -> project name, or
// task -> project -> client (order per page, see each page's own
// breadcrumb array). Every part except the last is normally a link back
// to that record; the last part (the current page) is rendered as plain
// text. Passed as PageHeader's `title` so every detail page reuses the
// exact same sticky bar — same height as the list-page headers — instead
// of each page growing its own title block.
export function HeaderBreadcrumb({ parts }: { parts: { label: string; href?: string }[] }) {
  return (
    <span className="truncate">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5 text-amo-white/40">/</span>}
          {part.href ? (
            <Link href={part.href} className="hover:underline">
              {part.label}
            </Link>
          ) : (
            part.label
          )}
        </span>
      ))}
    </span>
  );
}

// Shared sticky header for every page under (app) — dark green like the
// sidebar, the Date/Time/Location card on the right (an optional action
// button, e.g. Calendar's "Open in Google Calendar", sits just left of
// it). No logo on most pages: the sidebar already shows it, so repeating
// it would be redundant. The Dashboard is the one exception on desktop —
// its own sidebar entry hides the logo there (see Sidebar's hideLogo
// prop), and this header shows the full AMO lockup instead, with the
// title centered between it and the card. On mobile there's no room for
// the full lockup next to the icon-only sidebar rail (which always shows
// its own badge logo regardless of this prop, see Sidebar), so below `sm`
// this hides the image entirely and left-aligns the title like every
// other page's header.
export default function PageHeader({
  title,
  hour12,
  dateLocale,
  location,
  logoUrl,
  actions,
  centerActions,
}: {
  title: ReactNode;
  hour12: boolean;
  dateLocale: Locale | undefined;
  location: string;
  logoUrl?: string;
  actions?: ReactNode;
  // Centers `actions` over the header bar instead of the default in-flow
  // placement right after the title. Only safe for pages with a short,
  // fixed title (e.g. "Contacts") — a long dynamic title (a breadcrumb
  // with a record name in it) can grow into a centered button, which is
  // exactly the overlap bug the default in-flow placement below exists
  // to prevent.
  centerActions?: boolean;
}) {
  if (logoUrl) {
    return (
      <header className="sticky top-0 z-30 -mx-4 -mt-4 flex items-center justify-between gap-4 bg-amo-green px-4 py-3 sm:-mx-8 sm:-mt-8 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="Andrew Murphy Online" className="hidden h-auto w-36 shrink-0 object-contain sm:block sm:w-56" />
        <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-amo-white sm:absolute sm:left-1/2 sm:-translate-x-1/2 sm:text-2xl">
          {title}
        </h1>
        <div className="flex items-center gap-3">
          {actions}
          <DateTimeCard hour12={hour12} dateLocale={dateLocale} location={location} />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 -mx-4 -mt-4 flex items-center gap-4 bg-amo-green px-4 py-3 sm:-mx-8 sm:-mt-8 sm:px-8">
      <h1 className="min-w-0 flex-1 truncate font-display text-xl font-semibold text-amo-white sm:text-2xl">{title}</h1>
      {actions &&
        (centerActions ? (
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-3">{actions}</div>
        ) : (
          <div className="flex shrink-0 items-center gap-3">{actions}</div>
        ))}
      <DateTimeCard hour12={hour12} dateLocale={dateLocale} location={location} />
    </header>
  );
}
