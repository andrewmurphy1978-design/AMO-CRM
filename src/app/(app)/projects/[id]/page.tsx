import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
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
import { getLinkedCalendarEvents } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader, { HeaderBreadcrumb } from "../../page-header";

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
  const { project, hour12, calendarEvents } = await withScopedPrismaClient(async (db) => {
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
    return { project, hour12, calendarEvents };
  });

  if (!project) notFound();

  const openTasks = project.tasks.filter((t) => t.status !== "DONE");
  const doneTasks = project.tasks.filter((t) => t.status === "DONE");
  const clientName =
    [project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") || project.contact.email;

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
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-soft">
            {STATUS_LABELS[project.status]}
            {` · ${t.projectTypes[project.type]}`}
            {project.owner && ` · ${t.projectDetail.owner}: ${project.owner.name}`}
            {project.dueDate && ` · ${t.projectDetail.due} ${format(project.dueDate, "MMMM d, yyyy", { locale: dateLocale })}`}
          </p>
          {project.teamMembers.length > 0 && (
            <p className="mt-1 text-sm text-soft">
              {t.projectForm.teamMembers}: {project.teamMembers.map((tm) => tm.user.name).join(", ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href={`/projects/${project.id}/edit`}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
          >
            {t.projectDetail.edit}
          </Link>
          <DeleteProjectButton projectId={project.id} lang={lang} />
        </div>
      </div>

      {project.description && (
        <p className="max-w-3xl whitespace-pre-wrap text-sm text-ink">{project.description}</p>
      )}

      <CalendarEventsCard
        title={t.calendarApp.title}
        events={calendarEvents}
        noEventsLabel={t.calendarApp.noLinkedEvents}
        hour12={hour12}
        dateLocale={dateLocale}
        intlLocale={intlLocale}
      />

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

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">{t.proposals.title}</h2>
          <Link href={`/projects/${project.id}/proposals/new`} className="text-xs font-semibold text-amo-lime hover:underline">
            {t.proposals.buildFull}
          </Link>
        </div>
        <div className="mt-3">
          <QuickAddProposal projectId={project.id} lang={lang} />
        </div>
        {project.proposals.length > 0 && (
          <ul className="mt-2 divide-y divide-card-border">
            {project.proposals.map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} projectId={project.id} lang={lang} />
            ))}
          </ul>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.invoices.title}</h2>
        <div className="mt-3">
          <QuickAddInvoice projectId={project.id} lang={lang} />
        </div>
        {project.invoices.length > 0 && (
          <ul className="mt-2 divide-y divide-card-border">
            {project.invoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} projectId={project.id} lang={lang} />
            ))}
          </ul>
        )}
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{t.projectDetail.callsEmails}</h2>
        <div className="mt-3">
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
        </div>
      </section>
    </div>
  );
}
