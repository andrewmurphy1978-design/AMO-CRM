import { format } from "date-fns";
import { getDashboardCalendarEvents, getRecentlyCreatedEvents } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getResolvedEventLinks } from "@/lib/calendar-links";
import { getDict } from "@/lib/i18n/dictionaries";
import CalendarCard, { type CalendarLabels } from "./calendar-card";

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string | null }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email || "";
}

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

// `accessToken` is resolved once, sequentially, by the caller — see the
// comment on getUpcomingEvents in src/lib/google.ts for why this can't
// fetch it itself.
//
// Uses getDashboardCalendarEvents (not getUpcomingEvents) so the 3-day
// grid/table can see an event dated earlier this week — see that
// function's own comment in src/lib/google.ts. The "New events (last
// 48h)" table is fed by a separate getRecentlyCreatedEvents fetch
// instead, since a newly-created event can be scheduled far outside
// getDashboardCalendarEvents' own near-term display window.
export default async function CalendarCardServer({
  accessToken,
  lang,
  hour12,
  labels,
}: {
  accessToken: string | null;
  lang: "en" | "fr";
  hour12: boolean;
  labels: CalendarLabels;
}) {
  const newEventsCutoff = hoursAgoIso(48);
  const [events, newEvents] = accessToken
    ? await Promise.all([
        getDashboardCalendarEvents(accessToken),
        getRecentlyCreatedEvents(accessToken, newEventsCutoff),
      ])
    : [null, null];

  // One shared client for the link lookup and the contact/project/task/
  // booking option lists the event dialog needs — see the comment on the
  // equivalent block in src/app/(app)/page.tsx for why these share a
  // connection instead of each opening its own.
  const { links, contactOptions, projectOptions, taskOptions, bookingOptions, programOptions } = await withScopedPrismaClient(async (db) => {
    const links = events && events.length > 0 ? await getResolvedEventLinks(db, events.map((e) => e.id)) : {};
    const contacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
      select: { id: true, firstName: true, lastName: true, email: true, extraEmails: true },
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
    const affiliatePrograms = await db.affiliateProgram.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, extraEmails: true },
    });
    return {
      links,
      contactOptions: contacts.map((c) => ({ id: c.id, label: contactLabel(c), email: c.email, extraEmails: c.extraEmails })),
      projectOptions: projects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId })),
      taskOptions: tasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId })),
      bookingOptions: bookings,
      programOptions: affiliatePrograms.map((p) => ({ id: p.id, label: p.name, email: p.email, extraEmails: p.extraEmails })),
    };
  });

  const t = getDict(lang);
  const bookingLabelOptions = bookingOptions.map((b) => ({
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

  return (
    <CalendarCard
      initial={events}
      initialNewEvents={newEvents}
      links={links}
      connected={accessToken !== null}
      lang={lang}
      hour12={hour12}
      labels={labels}
      contactOptions={contactOptions}
      projectOptions={projectOptions}
      taskOptions={taskOptions}
      bookingOptions={bookingLabelOptions}
      programOptions={programOptions}
      eventDialogLabels={t.eventDialog}
      eventViewDialogLabels={t.eventViewDialog}
      linkPickerLabels={linkPickerLabels}
    />
  );
}
