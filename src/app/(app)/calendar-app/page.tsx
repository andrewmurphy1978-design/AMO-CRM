import Link from "next/link";
import { addDays, format, startOfDay, startOfWeek } from "date-fns";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getCalendarEventsInRange } from "@/lib/google";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";
import CalendarShell from "./calendar-shell";

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

// Hand-drawn like PlatformIcon's FaceTimeIcon — Google doesn't publish a
// Simple Icons mono mark that captures Google Calendar's actual multi-color
// app icon, so this recreates its look (four colored corner tiles behind a
// white face with a blue day number) instead of a single-color mask.
function GoogleCalendarIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" fill="#1a73e8" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" fill="#34a853" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" fill="#fbbc04" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" fill="#ea4335" />
      <rect x="5" y="5" width="14" height="14" rx="2" fill="#fff" stroke="#dadce0" strokeWidth="0.5" />
      <rect x="8" y="3" width="1.6" height="4" rx="0.8" fill="#4285f4" />
      <rect x="14.4" y="3" width="1.6" height="4" rx="0.8" fill="#4285f4" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#1a73e8" fontFamily="Arial, sans-serif">
        31
      </text>
    </svg>
  );
}

export default async function CalendarAppPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  // One shared client for every read below, including the one after the
  // Google Calendar fetch — see the comment on the equivalent block in
  // src/app/(app)/page.tsx for why; this page previously opened a second
  // scoped client just for the event-links lookup, which is the same
  // "two connections in one request" pattern that trips Cloudflare's
  // Error 1102, just sequential instead of concurrent.
  const { googleAccessToken, hour12, contacts, projects, tasks, bookings, events, eventLinks } = await withScopedPrismaClient(
    async (db) => {
      const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
      const hour12 = await getHour12(session, db);
      const contacts = await db.contact.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 300,
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      const projects = await db.project.findMany({
        orderBy: { name: "asc" },
        take: 300,
        select: { id: true, name: true, contactId: true },
      });
      const tasks = await db.task.findMany({
        where: { status: { not: "DONE" } },
        orderBy: { title: "asc" },
        take: 300,
        select: { id: true, title: true, projectId: true },
      });
      const bookings = await db.booking.findMany({
        orderBy: { scheduledFor: "desc" },
        take: 100,
        select: { id: true, eventName: true, contactName: true, scheduledFor: true, contactId: true },
      });

      // Matches CalendarShell's default view ("week", Sunday-start) so the
      // first paint doesn't need an extra client-side fetch.
      const today = startOfDay(new Date());
      const weekStart = startOfWeek(today, { weekStartsOn: 0 });
      const weekEnd = addDays(weekStart, 7);
      const events = googleAccessToken
        ? await getCalendarEventsInRange(googleAccessToken, weekStart.toISOString(), weekEnd.toISOString())
        : null;

      const eventIds = (events ?? []).map((e) => e.id);
      const eventLinks =
        eventIds.length > 0 ? await db.calendarEventLink.findMany({ where: { googleEventId: { in: eventIds } } }) : [];

      return { googleAccessToken, hour12, contacts, projects, tasks, bookings, events, eventLinks };
    }
  );
  const initialLinks = Object.fromEntries(
    eventLinks.map((l) => [
      l.googleEventId,
      { contactId: l.contactId ?? "", projectId: l.projectId ?? "", taskId: l.taskId ?? "", bookingId: l.bookingId ?? "" },
    ])
  );

  const contactOptions = contacts.map((c) => ({ id: c.id, label: contactLabel(c), email: c.email }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId }));
  const bookingOptions = bookings.map((b) => ({
    id: b.id,
    label: `${b.eventName ?? t.linkPicker.booking} (${b.scheduledFor ? format(b.scheduledFor, "MMM d") : "?"})`,
    contactId: b.contactId,
  }));

  const linkPickerLabels = {
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    none: t.linkPicker.none,
    clear: t.linkPicker.clear,
    searchPlaceholder: t.linkPicker.searchPlaceholder,
    noResults: t.linkPicker.noResults,
  };

  const openInCalendarButton = (
    <a
      href="https://calendar.google.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
    >
      <GoogleCalendarIcon className="h-4 w-4 shrink-0" />
      {t.calendarApp.openGoogleCalendar}
    </a>
  );

  return (
    <div className="space-y-4">
      {!googleAccessToken ? (
        <>
          <PageHeader
            title={t.calendarApp.title}
            hour12={hour12}
            dateLocale={dateLocale}
            location={t.dashboard.myLocation}
            actions={openInCalendarButton}
          />
          <p className="text-sm text-soft">
            {t.dashboard.calendarNotConnected}{" "}
            <Link href="/settings" className="font-semibold text-emerald-700 underline">
              {t.dashboard.emailConnectInSettings}
            </Link>
          </p>
        </>
      ) : (
        <CalendarShell
          initialEvents={events ?? []}
          initialLinks={initialLinks}
          contacts={contactOptions}
          projects={projectOptions}
          tasks={taskOptions}
          bookings={bookingOptions}
          hour12={hour12}
          dateLocale={dateLocale}
          intlLocale={intlLocale}
          lang={lang}
          title={t.calendarApp.title}
          location={t.dashboard.myLocation}
          headerActions={openInCalendarButton}
          refreshLabel={t.dashboard.refresh}
          refreshingLabel={t.dashboard.refreshing}
          labels={{
            today: t.calendarApp.today,
            addEvent: t.calendarApp.addEvent,
            viewMonth: t.calendarApp.viewMonth,
            viewWeek: t.calendarApp.viewWeek,
            view5Day: t.calendarApp.view5Day,
            view3Day: t.calendarApp.view3Day,
            viewDay: t.calendarApp.viewDay,
            viewTable: t.calendarApp.viewTable,
            todayColumn: t.dashboard.calendarToday,
            tomorrowColumn: t.dashboard.calendarTomorrow,
            noEvents: t.calendarApp.noEvents,
            eventDialog: t.eventDialog,
            eventViewDialog: t.eventViewDialog,
            linkPicker: linkPickerLabels,
          }}
        />
      )}
    </div>
  );
}
