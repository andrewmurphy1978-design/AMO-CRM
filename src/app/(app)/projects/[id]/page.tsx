import Link from "next/link";
import { notFound } from "next/navigation";
import { format, type Locale } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import DeleteProjectButton from "./delete-button";
import CalendarEventsCard from "../../calendar-events-card";
import LinkedEmailsList from "../../linked-emails-list";
import ProjectGeneralDialog from "./project-general-dialog";
import ProjectNotesDialog from "./project-notes-dialog";
import PhasesCard from "./phases-card";
import TasksCard, { type TaskCardItem } from "./tasks-card";
import NewInvoiceButton from "./new-invoice-button";
import NewEmailButton from "../../contacts/[id]/new-email-button";
import CallsSmsCard from "../../contacts/[id]/calls-sms-card";
import { updateProjectGeneral, updateProjectNotes, updatePhaseNotes } from "@/actions/projects";
import { getTwilioConfig, contactPhoneOptions } from "@/lib/twilio";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getLinkedCalendarEvents, getEventLinkTargets } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader, { HeaderBreadcrumb } from "../../page-header";
import Card from "@/components/section-card";
import ContactInfoPopover from "./contact-info-popover";
import { AvatarThumb, ContactInfoCard, TechStackCard, DomainsCard } from "../../contacts/[id]/contact-cards";

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const { id } = await params;
  const { phase: phaseParam } = await searchParams;
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
    users,
    calendarEvents,
    calendarEventLinks,
    calendarContactOptions,
    calendarProjectOptions,
    calendarTaskOptions,
    calendarPhaseOptions,
    calendarBookingOptions,
    calendarProgramOptions,
    addressColors,
    defaultComposeSource,
    twilioReady,
  } = await withScopedPrismaClient(async (db) => {
    const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
    const hour12 = await getHour12(session, db);
    const project = await db.project.findUnique({
      where: { id },
      include: {
        contact: { include: { messagingAccounts: { orderBy: { order: "asc" } }, techStackItems: { orderBy: { order: "asc" } }, domains: { orderBy: { order: "asc" } } } },
        owner: true,
        supervisor: true,
        teamMembers: { include: { user: true } },
        phases: { orderBy: { order: "asc" } },
        tasks: {
          orderBy: [{ status: "asc" }, { dueDate: "asc" }],
          include: { assignee: true },
        },
        interactions: {
          orderBy: { occurredAt: "desc" },
          include: { loggedBy: true, updatedBy: true, participants: { include: { contact: true, user: true } } },
        },
        emailLinks: { orderBy: { messageDate: "desc" } },
        proposals: { orderBy: { createdAt: "desc" } },
        invoices: { orderBy: { createdAt: "desc" } },
      },
    });
    const users = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    const addressColors = await db.emailAddressColor.findMany({ orderBy: { order: "asc" } });
    const composePrefs = session ? await db.user.findUnique({ where: { id: session.user.id }, select: { defaultComposeSource: true } }) : null;
    const twilioReady = Boolean(await getTwilioConfig(db));
    const calendarEvents = project ? await getLinkedCalendarEvents(
          db,
          { projectId: project.id, ...(phaseParam && project.phases.some((ph) => ph.id === phaseParam) ? { phaseId: phaseParam } : {}) },
          googleAccessToken
        ) : [];
    const calendarEventLinks = calendarEvents.length > 0 ? await getEventLinkTargets(db, calendarEvents.map((e) => e.id)) : {};

    // The event edit dialog's own contact/project/task/booking pickers —
    // same lists the full Calendar page and Dashboard card already ship,
    // needed here too now that this card opens that same dialog instead of
    // just linking out to Google Calendar.
    const [allContacts, allProjects, allTasks, allBookings, allPrograms] = await Promise.all([
      db.contact.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 300,
        select: { id: true, firstName: true, lastName: true, email: true, extraEmails: true },
      }),
      db.project.findMany({ orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, contactId: true } }),
      db.task.findMany({
        where: { status: { not: "DONE" } },
        orderBy: { title: "asc" },
        take: 300,
        select: { id: true, title: true, projectId: true, phaseId: true },
      }),
      db.booking.findMany({
        orderBy: { scheduledFor: "desc" },
        take: 100,
        select: { id: true, eventName: true, contactName: true, scheduledFor: true, contactId: true },
      }),
      db.affiliateProgram.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, extraEmails: true },
      }),
    ]);

    return {
      project,
      hour12,
      users,
      calendarEvents,
      calendarEventLinks,
      calendarContactOptions: allContacts.map((c) => ({
        id: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "",
        email: c.email,
        extraEmails: c.extraEmails,
      })),
      calendarProjectOptions: allProjects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId })),
      calendarTaskOptions: allTasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId, phaseId: tk.phaseId })),
      calendarPhaseOptions: (project?.phases ?? []).map((ph) => ({ id: ph.id, label: ph.name, projectId: ph.projectId })),
      calendarBookingOptions: allBookings,
      calendarProgramOptions: allPrograms.map((p) => ({ id: p.id, label: p.name, email: p.email, extraEmails: p.extraEmails })),
      addressColors,
      defaultComposeSource: composePrefs?.defaultComposeSource ?? null,
      twilioReady,
    };
  });

  if (!project) notFound();

  // A phase picked in the Phases card narrows the Tasks, Calendar, Emails and
  // Calls & SMS cards to that phase (?phase=<id>).
  const selectedPhase = project.phases.find((ph) => ph.id === phaseParam) ?? null;
  const selectedPhaseId = selectedPhase?.id;
  const inPhase = <T extends { phaseId: string | null }>(rows: T[]): T[] => (selectedPhaseId ? rows.filter((r) => r.phaseId === selectedPhaseId) : rows);
  const visibleTasks = inPhase(project.tasks);
  const visibleEmailLinks = inPhase(project.emailLinks);
  const visibleInteractions = inPhase(project.interactions);

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

  const clientName =
    [project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") || project.contact.email || "";
  const teamNames = project.teamMembers.map((tm) => tm.user.name);
  const toDateInput = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");

  // The client picker in the General Info dialog: the shared list, plus this
  // project's own client in case it fell outside the list's size cap.
  const clientOptions = calendarContactOptions.map((c) => ({ id: c.id, label: c.label }));
  if (!clientOptions.some((c) => c.id === project.contactId)) clientOptions.unshift({ id: project.contactId, label: clientName });

  const taskItems: TaskCardItem[] = visibleTasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    assignee: task.assignee ? { name: task.assignee.name } : null,
    values: {
      title: task.title,
      phaseId: task.phaseId ?? "",
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId ?? "",
      supervisorId: task.supervisorId ?? "",
      startDate: toDateInput(task.startDate),
      dueDate: toDateInput(task.dueDate),
      description: task.description ?? "",
    },
  }));

  const phaseRows = project.phases.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    phaseType: p.phaseType,
    teamMemberIds: p.teamMemberIds,
    supervisorId: p.supervisorId,
    startDate: toDateInput(p.startDate),
    dueDate: toDateInput(p.dueDate),
    description: p.description,
  }));

  const clientEmail = project.contact.email ?? project.contact.email2 ?? project.contact.extraEmails[0] ?? null;
  const namedContact = { id: project.contact.id, name: clientName || "—" };

  const emailLinkOptions = {
    contacts: calendarContactOptions,
    projects: calendarProjectOptions,
    tasks: calendarTaskOptions,
    phases: calendarPhaseOptions,
    programs: calendarProgramOptions,
    labels: {
      link: t.linkPicker.link,
      edit: t.linkPicker.edit,
      none: t.linkPicker.none,
      contact: t.linkPicker.contact,
      project: t.linkPicker.project,
      task: t.linkPicker.task,
      phase: t.linkPicker.phase,
      booking: t.linkPicker.booking,
      affiliateProgram: t.linkPicker.affiliateProgram,
      save: t.linkPicker.save,
      saving: t.linkPicker.saving,
      cancel: t.linkPicker.cancel,
      clear: t.linkPicker.clear,
      title: t.linkPicker.titleWithAffiliateProgram,
      searchPlaceholder: t.linkPicker.searchPlaceholder,
      noResults: t.linkPicker.noResults,
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <AvatarThumb
              url={project.contact.avatarUrl}
              firstName={project.contact.firstName}
              lastName={project.contact.lastName}
              size="h-10 w-10"
              textSize="text-xs"
            />
            <HeaderBreadcrumb
              parts={[{ label: clientName, href: `/contacts/${project.contact.id}` }, { label: project.name }]}
            />
            <ContactInfoPopover title={t.contactForm.cardContactInfo}>
              <ContactInfoCard contact={project.contact} lang={lang} defaultComposeSource={defaultComposeSource} hour12={hour12} />
            </ContactInfoPopover>
          </span>
        }
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
        actions={<DeleteProjectButton projectId={project.id} lang={lang} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            color="general"
            title={t.contactForm.cardGeneralInfo}
            compact
            actions={
              <ProjectGeneralDialog
                action={updateProjectGeneral.bind(null, project.id)}
                lang={lang}
                contacts={clientOptions}
                users={users}
                values={{
                  name: project.name,
                  status: project.status,
                  type: project.type,
                  contactId: project.contactId,
                  ownerId: project.ownerId ?? "",
                  supervisorId: project.supervisorId ?? "",
                  teamMemberIds: project.teamMembers.map((tm) => tm.userId),
                  startDate: toDateInput(project.startDate),
                  dueDate: toDateInput(project.dueDate),
                  description: project.description ?? "",
                }}
              />
            }
          >
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
              <div>
                <p className={LABEL_CLASS}>{t.projects.colSupervisor}</p>
                <p className="mt-1 text-sm text-ink">{project.supervisor?.name ?? t.common.unassigned}</p>
              </div>

              <div>
                <p className={LABEL_CLASS}>{t.projects.colStart}</p>
                <p className="mt-1 text-sm text-ink">{project.startDate ? longDate(project.startDate, lang, dateLocale) : "—"}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.projects.colDue}</p>
                <p className="mt-1 text-sm text-ink">{project.dueDate ? longDate(project.dueDate, lang, dateLocale) : "—"}</p>
              </div>
            </div>

            {project.description && (
              <div className="mt-4">
                <p className={LABEL_CLASS}>{t.projectForm.description}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{project.description}</p>
              </div>
            )}
          </Card>

          <PhasesCard
            projectId={project.id}
            phases={phaseRows}
            users={users}
            defaultTeamMemberIds={project.teamMembers.map((tm) => tm.userId)}
            selectedPhaseId={selectedPhaseId ?? null}
            lang={lang}
          />

          <Card
            color="notes"
            title={
              <>
                {t.projectDetail.notesTitle}
                {selectedPhase && <span className="truncate text-xs font-medium normal-case opacity-90">· {selectedPhase.name}</span>}
              </>
            }
            compact
            actions={
              selectedPhase ? (
                <ProjectNotesDialog
                  key={selectedPhase.id}
                  action={updatePhaseNotes.bind(null, project.id, selectedPhase.id)}
                  notes={selectedPhase.notes ?? ""}
                  title={`${t.projectDetail.notesTitle} · ${selectedPhase.name}`}
                  lang={lang}
                />
              ) : (
                <ProjectNotesDialog action={updateProjectNotes.bind(null, project.id)} notes={project.notes ?? ""} lang={lang} />
              )
            }
          >
            {(selectedPhase ? selectedPhase.notes : project.notes) ? (
              <p className="whitespace-pre-wrap text-sm text-ink">{selectedPhase ? selectedPhase.notes : project.notes}</p>
            ) : (
              <p className="text-sm text-soft">{t.projectDetail.noNotesYet}</p>
            )}
          </Card>

          <TasksCard
            projectId={project.id}
            tasks={taskItems}
            users={users}
            phases={project.phases.map((p) => ({ id: p.id, name: p.name }))}
            lang={lang}
          />

          <TechStackCard contact={project.contact} lang={lang} />

          <DomainsCard contact={project.contact} lang={lang} />
        </div>

        <div className="space-y-6">
          <CalendarEventsCard
            title={t.calendarApp.title}
            events={calendarEvents}
            links={calendarEventLinks}
            contacts={calendarContactOptions}
            projects={calendarProjectOptions}
            tasks={calendarTaskOptions}
            phases={calendarPhaseOptions}
            bookings={calendarBookingLabelOptions}
            programs={calendarProgramOptions}
            noEventsLabel={t.calendarApp.noLinkedEvents}
            hour12={hour12}
            intlLocale={intlLocale}
            lang={lang}
            eventDialogLabels={t.eventDialog}
            eventViewDialogLabels={t.eventViewDialog}
            linkPickerLabels={calendarLinkPickerLabels}
            newEventLinks={{ contactId: project.contactId, projectId: project.id, ...(selectedPhaseId ? { phaseId: selectedPhaseId } : {}) }}
          />

          <Card
            color="linkedEmails"
            title={
              <>
                {t.contactDetail.linkedEmailsTitle}
                {visibleEmailLinks.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">
                    {visibleEmailLinks.length}
                  </span>
                )}
              </>
            }
            compact
            actions={
              <NewEmailButton
                email={clientEmail}
                defaultComposeSource={defaultComposeSource}
                lang={lang}
                intlLocale={intlLocale}
                hour12={hour12}
                emailComposeLabels={t.emailCompose}
                title={t.emailCompose.newTitle}
                linkOptions={emailLinkOptions}
                defaultLink={{ contactId: project.contactId, projectId: project.id, phaseId: selectedPhaseId }}
              />
            }
          >
            <LinkedEmailsList
              emailLinks={visibleEmailLinks.map((link) => ({
                id: link.id,
                gmailThreadId: link.gmailThreadId,
                subject: link.subject,
                fromLabel: link.fromLabel,
                messageDate: link.messageDate ? link.messageDate.toISOString() : null,
                gmailLink: link.gmailLink,
                myAddress: link.myAddress,
                contactId: link.contactId,
                projectId: link.projectId,
                phaseId: link.phaseId,
                taskId: link.taskId,
                affiliateProgramId: link.affiliateProgramId,
              }))}
              linkOptions={emailLinkOptions}
              addressColors={addressColors}
              noLinkedEmailsLabel={t.contactDetail.noLinkedEmails}
              lang={lang}
              intlLocale={intlLocale}
              hour12={hour12}
              emailDialogLabels={t.emailDialog}
              emailComposeLabels={t.emailCompose}
            />
          </Card>

          <CallsSmsCard
            title={t.contactDetail.callsEmails}
            contactId={project.contactId}
            contact={namedContact}
            relatedContacts={[]}
            teamMembers={users}
            defaultProjectId={project.id}
            defaultPhaseId={selectedPhaseId}
            linkData={{
              projects: [{ id: project.id, name: project.name, contactId: project.contactId }],
              phases: project.phases.map((ph) => ({ id: ph.id, name: ph.name, projectId: project.id })),
              tasks: project.tasks.filter((tk) => tk.status !== "DONE").map((tk) => ({ id: tk.id, name: tk.title, projectId: project.id, phaseId: tk.phaseId })),
            }}
            currentUserId={session?.user.id ?? null}
            sending={{ ready: twilioReady, numbers: contactPhoneOptions(project.contact) }}
            lang={lang}
            entries={visibleInteractions.map((i) => ({
              id: i.id,
              type: i.type,
              subject: i.subject,
              notes: i.notes,
              occurredAt: i.occurredAt.toISOString(),
              durationMinutes: i.durationMinutes,
              createdAt: i.createdAt.toISOString(),
              updatedAt: i.updatedAt.toISOString(),
              createdBy: i.loggedBy?.name ?? null,
              updatedBy: i.updatedBy?.name ?? null,
              contactId: i.contactId,
              projectId: i.projectId,
              phaseId: i.phaseId,
              taskId: i.taskId,
              direction: i.direction,
              deliveryStatus: i.deliveryStatus,
              externalNumber: i.externalNumber,
              errorCode: i.errorCode,
              seenAt: i.seenAt ? i.seenAt.toISOString() : null,
              participants: i.participants.map((p) =>
                p.contact
                  ? { kind: "contact" as const, id: p.contact.id, name: [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || p.contact.company || "—" }
                  : { kind: "user" as const, id: p.user?.id ?? "", name: p.user?.name ?? "—" }
              ),
            }))}
          />

          <Card
            color="proposals"
            title={t.proposals.title}
            compact
            actions={
              <Link
                href={`/projects/${project.id}/proposals/new`}
                title={t.contactDetail.newProposal}
                aria-label={t.contactDetail.newProposal}
                className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
              >
                +
              </Link>
            }
          >
            {project.proposals.length === 0 ? (
              <p className="text-sm text-soft">{t.contactDetail.noProposalsYet}</p>
            ) : (
              <ul className="divide-y divide-card-border">
                {project.proposals.map((proposal) => (
                  <li key={proposal.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <Link href={`/projects/${project.id}/proposals/${proposal.id}`} className="flex-1 font-medium text-ink hover:underline">
                      {proposal.title}
                    </Link>
                    {proposal.amount != null && (
                      <span className="text-soft">
                        {proposal.amount} {proposal.currency}
                      </span>
                    )}
                    <span className="text-xs text-soft">{t.proposals.statuses[proposal.status as keyof typeof t.proposals.statuses]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card color="invoices" title={t.invoices.title} compact actions={<NewInvoiceButton projectId={project.id} lang={lang} />}>
            {project.invoices.length === 0 ? (
              <p className="text-sm text-soft">{t.contactDetail.noInvoicesYet}</p>
            ) : (
              <ul className="divide-y divide-card-border">
                {project.invoices.map((invoice) => (
                  <li key={invoice.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <Link href={`/projects/${project.id}/invoices/${invoice.id}`} className="flex-1 font-medium text-ink hover:underline">
                      {invoice.number || t.invoices.title}
                    </Link>
                    {invoice.amount != null && (
                      <span className="text-soft">
                        {invoice.amount} {invoice.currency}
                      </span>
                    )}
                    <span className="text-xs text-soft">{t.invoices.statuses[invoice.status as keyof typeof t.invoices.statuses]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
