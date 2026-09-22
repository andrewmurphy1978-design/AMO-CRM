import Link from "next/link";
import { notFound } from "next/navigation";
import { format, type Locale } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import TaskRow from "./task-row";
import QuickAddTask from "./quick-add-task";
import DeleteProjectButton from "./delete-button";
import QuickAddProposal from "./quick-add-proposal";
import ProposalRow from "./proposal-row";
import QuickAddInvoice from "./quick-add-invoice";
import InvoiceRow from "./invoice-row";
import InteractionLog from "../../interaction-log";
import CalendarEventsCard from "../../calendar-events-card";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getLinkedCalendarEvents, getEventLinkTargets } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader, { HeaderBreadcrumb } from "../../page-header";
import Card from "@/components/section-card";

const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-soft";

// Full month-name date, e.g. "September 26, 2026" / "26 septembre 2026" —
// date-fns' locale only translates the month name, not the token order, so
// a fixed "MMMM d, yyyy" pattern would read wrong in French; French wants
// day before month and no comma.
function longDate(date: Date, lang: "en" | "fr", dateLocale: Locale | undefined): string {
  return format(date, lang === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", { locale: dateLocale });
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";
  const STATUS_LABELS = t.projectStatuses;

  const session = await auth();

  // One shared client for the reads below — see the comment on the
  // equivalent block in contacts/[id]/page.tsx for why (Cloudflare Error
  // 1102 risk from the plain `prisma` proxy's fresh-connection-per-call
  // behavior across several sequential reads).
  const {
    project,
    hour12,
    calendarEvents,
    calendarEventLinks,
    calendarContactOptions,
    calendarProjectOptions,
    calendarTaskOptions,
    calendarBookingOptions,
  } = await withScopedPrismaClient(async (db) => {
    const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
    const hour12 = await getHour12(session, db);
    const project = await db.project.findUnique({
      where: { id },
      include: {
        contact: true,
        owner: true,
        teamMembers: { include: { user: true } },
        tasks: {
          orderBy: [{ status: "asc" }, { dueDate: "asc" }],
          include: { assignee: true },
        },
        interactions: {
          orderBy: { occurredAt: "desc" },
          include: { loggedBy: true },
        },
        proposals: { orderBy: { createdAt: "desc" } },
        invoices: { orderBy: { createdAt: "desc" } },
      },
    });
    const calendarEvents = project ? await getLinkedCalendarEvents(db, { projectId: project.id }, googleAccessToken) : [];
    const calendarEventLinks = calendarEvents.length > 0 ? await getEventLinkTargets(db, calendarEvents.map((e) => e.id)) : {};

    // The event edit dialog's own contact/project/task/booking pickers —
    // same lists the full Calendar page and Dashboard card already ship,
    // needed here too now that this card opens that same dialog instead of
    // just linking out to Google Calendar.
    const [allContacts, allProjects, allTasks, allBookings] = await Promise.all([
      db.contact.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 300,
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
      db.project.findMany({ orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, contactId: true } }),
      db.task.findMany({
        where: { status: { not: "DONE" } },
        orderBy: { title: "asc" },
        take: 300,
        select: { id: true, title: true, projectId: true },
      }),
      db.booking.findMany({
        orderBy: { scheduledFor: "desc" },
        take: 100,
        select: { id: true, eventName: true, contactName: true, scheduledFor: true, contactId: true },
      }),
    ]);

    return {
      project,
      hour12,
      calendarEvents,
      calendarEventLinks,
      calendarContactOptions: allContacts.map((c) => ({
        id: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
        email: c.email,
      })),
      calendarProjectOptions: allProjects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId })),
      calendarTaskOptions: allTasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId })),
      calendarBookingOptions: allBookings,
    };
  });

  if (!project) notFound();

  const calendarBookingLabelOptions = calendarBookingOptions.map((b) => ({
    id: b.id,
    label: `${b.eventName ?? t.linkPicker.booking} (${b.scheduledFor ? format(b.scheduledFor, "MMM d") : "?"})`,
    contactId: b.contactId,
  }));
  const calendarLinkPickerLabels = {
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    none: t.linkPicker.none,
    clear: t.linkPicker.clear,
    searchPlaceholder: t.linkPicker.searchPlaceholder,
    noResults: t.linkPicker.noResults,
  };

  const openTasks = project.tasks.filter((t) => t.status !== "DONE");
  const doneTasks = project.tasks.filter((t) => t.status === "DONE");
  const clientName =
    [project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") || project.contact.email;
  const teamNames = project.teamMembers.map((tm) => tm.user.name);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <HeaderBreadcrumb
            parts={[{ label: clientName, href: `/contacts/${project.contact.id}` }, { label: project.name }]}
          />
        }
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          <>
            <Link
              href={`/projects/${project.id}/edit`}
              className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
            >
              {t.projectDetail.edit}
            </Link>
            <DeleteProjectButton projectId={project.id} lang={lang} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card color="general" title={t.contactForm.cardGeneralInfo}>
            <h1 className="font-display text-xl font-semibold text-ink">{project.name}</h1>

            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className={LABEL_CLASS}>{t.projects.colStatus}</p>
                <p className="mt-1 text-sm text-ink">{STATUS_LABELS[project.status]}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.projects.colType}</p>
                <p className="mt-1 text-sm text-ink">{t.projectTypes[project.type]}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.projects.colClient}</p>
                <p className="mt-1 text-sm">
                  <Link href={`/contacts/${project.contact.id}`} className="text-amo-lime hover:underline">
                    {clientName}
                  </Link>
                </p>
              </div>

              <div>
                <p className={LABEL_CLASS}>{t.projects.colOwner}</p>
                <p className="mt-1 text-sm text-ink">{project.owner?.name ?? t.common.unassigned}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.projects.colTeam}</p>
                <p className="mt-1 text-sm text-ink">{teamNames.length > 0 ? teamNames.join(", ") : "—"}</p>
              </div>
              <div />

              <div>
                <p className={LABEL_CLASS}>{t.projects.colStart}</p>
                <p className="mt-1 text-sm text-ink">{project.startDate ? longDate(project.startDate, lang, dateLocale) : "—"}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.projects.colDue}</p>
                <p className="mt-1 text-sm text-ink">{project.dueDate ? longDate(project.dueDate, lang, dateLocale) : "—"}</p>
              </div>
            </div>
          </Card>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.projectDetail.tasksTitle}</h2>
            <div className="mt-3">
              <QuickAddTask projectId={project.id} lang={lang} />
            </div>

            {openTasks.length === 0 && doneTasks.length === 0 ? (
              <p className="mt-4 text-sm text-soft">{t.projectDetail.noTasksYet}</p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-card-border">
                  {openTasks.map((task) => (
                    <TaskRow key={task.id} task={task} projectId={project.id} lang={lang} />
                  ))}
                </ul>
                {doneTasks.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-soft">
                      {t.projectDetail.completed(doneTasks.length)}
                    </summary>
                    <ul className="mt-2 divide-y divide-card-border">
                      {doneTasks.map((task) => (
                        <TaskRow key={task.id} task={task} projectId={project.id} lang={lang} />
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <CalendarEventsCard
            title={t.calendarApp.title}
            events={calendarEvents}
            links={calendarEventLinks}
            contacts={calendarContactOptions}
            projects={calendarProjectOptions}
            tasks={calendarTaskOptions}
            bookings={calendarBookingLabelOptions}
            noEventsLabel={t.calendarApp.noLinkedEvents}
            hour12={hour12}
            dateLocale={dateLocale}
            intlLocale={intlLocale}
            lang={lang}
            eventDialogLabels={t.eventDialog}
            eventViewDialogLabels={t.eventViewDialog}
            linkPickerLabels={calendarLinkPickerLabels}
          />

          <Card
            color="proposals"
            title={t.proposals.title}
            actions={
              <Link href={`/projects/${project.id}/proposals/new`} className="text-xs font-semibold text-white hover:underline">
                {t.proposals.buildFull}
              </Link>
            }
          >
            <QuickAddProposal projectId={project.id} lang={lang} />
            {project.proposals.length > 0 && (
              <ul className="divide-y divide-card-border">
                {project.proposals.map((proposal) => (
                  <ProposalRow key={proposal.id} proposal={proposal} projectId={project.id} lang={lang} />
                ))}
              </ul>
            )}
          </Card>

          <Card color="invoices" title={t.invoices.title}>
            <QuickAddInvoice projectId={project.id} lang={lang} />
            {project.invoices.length > 0 && (
              <ul className="divide-y divide-card-border">
                {project.invoices.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} projectId={project.id} lang={lang} />
                ))}
              </ul>
            )}
          </Card>

          <Card color="interactions" title={t.projectDetail.callsEmails}>
            <InteractionLog
              lang={lang}
              contactId={project.contactId}
              projectId={project.id}
              interactions={project.interactions.map((i) => ({
                id: i.id,
                type: i.type,
                subject: i.subject,
                notes: i.notes,
                occurredAt: i.occurredAt.toISOString(),
                loggedBy: i.loggedBy ? { name: i.loggedBy.name } : null,
              }))}
            />
          </Card>

          <Card color="notes" title={t.projectDetail.notesTitle}>
            {project.description ? (
              <p className="whitespace-pre-wrap text-sm text-ink">{project.description}</p>
            ) : (
              <p className="text-sm text-soft">{t.projectDetail.noNotesYet}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
