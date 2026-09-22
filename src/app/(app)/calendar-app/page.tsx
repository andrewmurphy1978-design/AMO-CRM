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

  const contactOptions = contacts.map((c) => ({ id: c.id, label: contactLabel(c) }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId }));
  const bookingOptions = bookings.map((b) => ({
    id: b.id,
    label: `${b.eventName ?? t.linkPicker.booking} (${b.scheduledFor ? format(b.scheduledFor, "MMM d") : "?"})`,
    contactId: b.contactId,
  }));

  const linkDialogLabels = {
    link: t.linkPicker.link,
    edit: t.linkPicker.edit,
    none: t.linkPicker.none,
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    affiliateProgram: t.linkPicker.affiliateProgram,
    save: t.linkPicker.save,
    saving: t.linkPicker.saving,
    cancel: t.linkPicker.cancel,
    clear: t.linkPicker.clear,
    title: t.linkPicker.titleWithBooking,
    searchPlaceholder: t.linkPicker.searchPlaceholder,
    noResults: t.linkPicker.noResults,
  };

  const openInCalendarButton = (
    <Link href="/calendar" className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm">
      {t.dashboard.openInCalendar}
    </Link>
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
            linkDialog: linkDialogLabels,
          }}
        />
      )}
    </div>
  );
}
