import Link from "next/link";
import { format } from "date-fns";
import { auth } from "@/lib/auth";
import { prisma, withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getUpcomingEvents } from "@/lib/google";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";
import CalendarLinkPicker from "./calendar-link-picker";

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

// Same reasoning as calendar-card.tsx: Intl directly, with an explicit
// hour12, rather than date-fns' locale default.
function formatEventTime(iso: string, hour12: boolean, intlLocale: string): string {
  return new Intl.DateTimeFormat(intlLocale, { hour: "numeric", minute: "2-digit", hour12 }).format(new Date(iso));
}

export default async function CalendarAppPage() {
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  // One shared client for the reads below — see the comment on the
  // equivalent block in src/app/(app)/page.tsx for why.
  const { googleAccessToken, hour12, contacts, projects, tasks, bookings } = await withScopedPrismaClient(async (db) => {
    const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
    const hour12 = await getHour12(session, db);
    const contacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const projects = await db.project.findMany({ orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } });
    const tasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true },
    });
    const bookings = await db.booking.findMany({
      orderBy: { scheduledFor: "desc" },
      take: 100,
      select: { id: true, eventName: true, contactName: true, scheduledFor: true },
    });
    return { googleAccessToken, hour12, contacts, projects, tasks, bookings };
  });

  const events = googleAccessToken ? await getUpcomingEvents(googleAccessToken) : null;

  const eventIds = (events ?? []).map((e) => e.id);
  const eventLinks =
    eventIds.length > 0
      ? await prisma.calendarEventLink.findMany({
          where: { googleEventId: { in: eventIds } },
          include: { contact: true, project: true, task: true, booking: true },
        })
      : [];
  const linksByEvent = new Map(eventLinks.map((l) => [l.googleEventId, l]));

  const contactOptions = contacts.map((c) => ({ id: c.id, label: contactLabel(c) }));
  const projectOptions = projects.map((p) => ({ id: p.id, label: p.name }));
  const taskOptions = tasks.map((tk) => ({ id: tk.id, label: tk.title }));
  const bookingOptions = bookings.map((b) => ({
    id: b.id,
    label: `${b.eventName ?? "Booking"} — ${b.contactName ?? ""} (${b.scheduledFor ? format(b.scheduledFor, "MMM d") : "?"})`,
  }));

  const linkLabels = {
    link: t.linkPicker.link,
    edit: t.linkPicker.edit,
    none: t.linkPicker.none,
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    save: t.linkPicker.save,
    saving: t.linkPicker.saving,
    cancel: t.linkPicker.cancel,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.calendarApp.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          <Link
            href="/calendar"
            className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold shadow-sm sm:text-sm"
          >
            {t.dashboard.openInCalendar}
          </Link>
        }
      />
      <p className="text-sm text-soft">{t.calendarApp.subtitle}</p>

      {!googleAccessToken ? (
        <p className="text-sm text-soft">
          {t.dashboard.calendarNotConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {t.dashboard.emailConnectInSettings}
          </Link>
        </p>
      ) : !events || events.length === 0 ? (
        <p className="text-sm text-soft">{t.calendarApp.noEvents}</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-card-border bg-card-bg shadow-sm">
          <ul>
            {events.map((event, i) => {
              const link = linksByEvent.get(event.id);
              const linkedLabel = link
                ? link.contact
                  ? contactLabel(link.contact)
                  : link.project
                    ? link.project.name
                    : link.task
                      ? link.task.title
                      : link.booking
                        ? (link.booking.eventName ?? t.linkPicker.booking)
                        : null
                : null;
              return (
                <li key={event.id} className={i % 2 === 1 ? "bg-black/[0.03]" : ""}>
                  <div className="flex items-start gap-3 px-4 py-2.5">
                    <div className="w-28 shrink-0 text-xs text-soft">
                      {event.start && (
                        <>
                          <p className="font-medium text-ink">{format(new Date(event.start), "EEE d MMM", { locale: dateLocale })}</p>
                          {!event.allDay && <p>{formatEventTime(event.start, hour12, intlLocale)}</p>}
                        </>
                      )}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm text-ink">{event.title}</p>
                  </div>
                  <div className="px-4 pb-2.5 pl-[7.75rem]">
                    <CalendarLinkPicker
                      googleEventId={event.id}
                      contacts={contactOptions}
                      projects={projectOptions}
                      tasks={taskOptions}
                      bookings={bookingOptions}
                      initialContactId={link?.contactId ?? ""}
                      initialProjectId={link?.projectId ?? ""}
                      initialTaskId={link?.taskId ?? ""}
                      initialBookingId={link?.bookingId ?? ""}
                      summary={linkedLabel ? t.linkPicker.linkedTo(linkedLabel) : null}
                      labels={linkLabels}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
