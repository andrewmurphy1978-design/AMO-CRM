import Link from "next/link";
import { auth } from "@/lib/auth";
import { getGoogleConnection } from "@/lib/google";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";

// Google's own embeddable calendar view — this is the one Google Calendar
// surface that actually allows being framed (the full calendar.google.com
// app blocks it), which is what makes "open inside this app instead of a
// new tab" possible at all. It's a read-only, whole-calendar view — Google
// doesn't expose a way to deep-link an embed straight to one event's edit
// dialog — so clicking an appointment elsewhere in the CRM brings you here
// rather than to that exact event.
function embedUrl(calendarId: string): string {
  const params = new URLSearchParams({ src: calendarId, ctz: "America/Montreal" });
  return `https://calendar.google.com/calendar/embed?${params.toString()}`;
}

export default async function CalendarPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  const googleConnection = session ? await getGoogleConnection(session.user.id) : null;
  const hour12 = await getHour12(session);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.dashboard.calendarTitle}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
      />
      {googleConnection?.email ? (
        <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
          <iframe src={embedUrl(googleConnection.email)} className="h-[75vh] w-full border-0" title="Google Calendar" />
        </div>
      ) : (
        <p className="text-sm text-soft">
          {t.dashboard.calendarNotConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {t.dashboard.emailConnectInSettings}
          </Link>
        </p>
      )}
    </div>
  );
}
