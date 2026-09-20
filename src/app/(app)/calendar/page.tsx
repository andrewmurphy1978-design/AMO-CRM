import Link from "next/link";
import { auth } from "@/lib/auth";
import { getGoogleConnection } from "@/lib/google";
import { getHour12 } from "@/lib/time-format";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";

// Google's own embeddable calendar view — this is the one Google Calendar
// surface that actually allows being framed (the full calendar.google.com
// app blocks it), which is what makes "open inside this app instead of a
// new tab" possible at all. Two real limitations come with that: it's
// read-only (no creating/editing/deleting events — Google doesn't expose
// an editable embed at all), and it colors events by calendar rather than
// by each event's own colorId, so a single calendar's events all render in
// one color here even though the Dashboard's own 3-day grid (which reads
// colorId straight from the API) shows them in their real colors. Neither
// is fixable through URL params — it's what the embed widget is. The
// "Open in Google Calendar" header button is the way out to actually edit
// something.
function embedUrl(calendarId: string): string {
  const params = new URLSearchParams({ src: calendarId, ctz: "America/Montreal", mode: "WEEK" });
  return `https://calendar.google.com/calendar/embed?${params.toString()}`;
}

export default async function CalendarPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  // One shared client — see src/lib/prisma.ts for why.
  const { googleConnection, hour12 } = await withScopedPrismaClient(async (db) => {
    const googleConnection = session ? await getGoogleConnection(session.user.id, db) : null;
    const hour12 = await getHour12(session, db);
    return { googleConnection, hour12 };
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t.dashboard.calendarTitle}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          googleConnection?.email ? (
            <a
              href="https://calendar.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
            >
              {t.dashboard.openInCalendar}
            </a>
          ) : undefined
        }
      />
      {googleConnection?.email ? (
        <div className="-mx-4 -mb-4 mt-4 flex-1 sm:-mx-8 sm:-mb-8">
          <iframe
            src={embedUrl(googleConnection.email)}
            className="h-full w-full border-0"
            title="Google Calendar"
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-soft">
          {t.dashboard.calendarNotConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {t.dashboard.emailConnectInSettings}
          </Link>
        </p>
      )}
    </div>
  );
}
