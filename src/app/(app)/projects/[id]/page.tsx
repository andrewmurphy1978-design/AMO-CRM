import Link from "next/link";
import { notFound } from "next/navigation";
import { format, type Locale } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import DeleteProjectButton from "./delete-button";
import CalendarEventsCard from "../../calendar-events-card";
import LinkedEmailsList from "../../linked-emails-list";
import ProjectGeneralDialog from "./project-general-dialog";
import ProjectDetailsDialog from "./project-details-dialog";
import ProjectNotesDialog from "./project-notes-dialog";
import PhasesCard from "./phases-card";
import TasksCard, { type TaskCardItem } from "./tasks-card";
import { ProposalsCard, InvoicesCard, type ProposalRowData, type InvoiceRowData } from "./documents-cards";
import { contactTaxLocation } from "@/lib/billing-totals";
import SupplierCard, { type SupplierRow } from "./supplier-card";
import InstalmentsCard, { type InstalmentRow } from "./instalments-card";
import NewEmailButton from "../../contacts/[id]/new-email-button";
import CallsSmsCard from "../../contacts/[id]/calls-sms-card";
import { updateProjectGeneral, updateProjectNotes, updatePhaseNotes, updateProjectCustomFields } from "@/actions/projects";
import { getProjectTemplate } from "@/lib/project-template-store";
import { displayValue, isFieldVisible, type FieldValues } from "@/lib/project-templates";
import { getTwilioConfig, contactPhoneOptions } from "@/lib/twilio";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getLinkedCalendarEvents, getEventLinkTargets } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { loadTypeInfo } from "@/lib/project-type-store";

import { frText, localizeText, localizeValue } from "@/lib/project-i18n";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader, { HeaderBreadcrumb } from "../../page-header";
import Card from "@/components/section-card";
import AiExportMenu from "../../contacts/[id]/ai-export-menu";
import { PROJECT_AI_FILES } from "@/lib/contact-ai-files";
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
  const { labels: typeLabels, customKeys: customTypeKeys } = await loadTypeInfo(lang);
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
    template,
    catalog,
    billingChargeTax,
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
        supplierInvoices: { orderBy: { createdAt: "desc" }, omit: { fileData: true } },
        proposals: { orderBy: { createdAt: "desc" }, include: { paymentSchedule: { orderBy: { order: "asc" } }, lineItems: { orderBy: { order: "asc" } } } },
        invoices: { orderBy: { createdAt: "desc" }, include: { lineItems: { orderBy: { order: "asc" } }, instalment: { include: { proposal: { select: { paymentSchedule: { select: { id: true }, orderBy: { order: "asc" } } } } } } } },
      },
    });
    const users = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    const addressColors = await db.emailAddressColor.findMany({ orderBy: { order: "asc" } });
    const composePrefs = session ? await db.user.findUnique({ where: { id: session.user.id }, select: { defaultComposeSource: true } }) : null;
    const twilioReady = Boolean(await getTwilioConfig(db));
    const catalog = await db.servicePriceListItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    const billingChargeTax = (await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } })).chargeCanadianTax;
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
      catalog,
      billingChargeTax,
      template: project ? await getProjectTemplate(db, project.type) : null,
    };
  });

  if (!project) notFound();

  // A phase picked in the Phases card narrows the Tasks, Calendar, Emails and
  // Calls & SMS cards to that phase (?phase=<id>).
  // The active phase = the first one not yet finished (else the last). With no
  // ?phase in the address it is selected automatically; ?phase=all shows
  // everything.
  const phaseDone = (ph: (typeof project.phases)[number]) => {
    const own = project.tasks.filter((tk) => tk.phaseId === ph.id);
    return ph.status === "COMPLETED" || (own.length > 0 && own.every((tk) => tk.status === "DONE"));
  };
  const activePhase = project.phases.find((ph) => !phaseDone(ph)) ?? project.phases[project.phases.length - 1] ?? null;
  const selectedPhase =
    phaseParam === "all" ? null : (project.phases.find((ph) => ph.id === phaseParam) ?? (phaseParam ? null : activePhase));
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

  // French reader: show the built-in phases / tasks in French (stored in English).
  if (lang === "fr") {
    for (const ph of project.phases) ph.name = frText(ph.name);
    for (const tk of project.tasks) tk.title = frText(tk.title);
  }

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
      completedDate: toDateInput(task.completedAt),
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
    completedDate: toDateInput(p.completedAt),
    description: p.description,
  }));

  // The accepted proposal's payment schedule (instalments), if any.
  const acceptedProposal = project.proposals.find((p) => p.status === "ACCEPTED" && p.paymentSchedule.length > 0);
  const instalmentRows: InstalmentRow[] = (acceptedProposal?.paymentSchedule ?? []).map((row) => {
    const amount = row.amount ?? (row.percentage != null && acceptedProposal ? (row.percentage / 100) * acceptedProposal.totalAmount : null);
    return {
      id: row.id,
      label: row.label,
      amountText: [row.percentage != null ? `${row.percentage}%` : "", amount != null && acceptedProposal ? `${amount.toFixed(2)} ${acceptedProposal.currency}` : ""].filter(Boolean).join(" · "),
      dueText: row.dueDate ? longDate(row.dueDate, lang, dateLocale) : "",
      paid: row.paid,
    };
  });

  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const supplierRows: SupplierRow[] = project.supplierInvoices.map((c) => ({
    id: c.id,
    supplier: c.supplier,
    reference: c.reference,
    description: c.description,
    invoiceDate: ymd(c.invoiceDate),
    paidDate: ymd(c.paidDate),
    currency: c.currency,
    subtotal: c.subtotal,
    gstAmount: c.gstAmount,
    qstAmount: c.qstAmount,
    hstAmount: c.hstAmount,
    totalAmount: c.totalAmount,
    paymentMethod: c.paymentMethod,
    reimbursable: c.reimbursable,
    reimbursementStatus: c.reimbursementStatus,
    attachToProposal: c.attachToProposal,
    notes: c.notes,
    fileName: c.fileName,
    hasFile: Boolean(c.fileName),
  }));

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const proposalRows: ProposalRowData[] = project.proposals.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    currency: p.currency,
    totalAmount: p.totalAmount,
    approvedAt: iso(p.approvedAt),
    sentAt: iso(p.sentAt),
    coverLetter: p.coverLetter,
    notes: p.notes,
    lineItems: p.lineItems.map((li) => ({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice })),
    subscriptions: (Array.isArray(p.subscriptions) ? p.subscriptions : []) as { name: string; amount: number; period: string; note: string }[],
    paymentSchedule: p.paymentSchedule.map((r) => ({ label: r.label, percentage: r.percentage, amount: r.amount, dueDate: iso(r.dueDate) })),
  }));
  const invoiceRows: InvoiceRowData[] = project.invoices.map((inv) => {
    const ids = inv.instalment?.proposal.paymentSchedule.map((r) => r.id) ?? [];
    return {
      id: inv.id,
      number: inv.number,
      status: inv.status,
      currency: inv.currency,
      totalAmount: inv.totalAmount || inv.amount,
      dueDate: iso(inv.dueDate),
      approvedAt: iso(inv.approvedAt),
      notes: inv.notes,
      instalmentLabel: inv.instalment ? `${lang === "fr" ? "Versement" : "Instalment"} ${ids.indexOf(inv.instalment.id) + 1}/${ids.length} · ${inv.instalment.label}` : null,
      lineItems: inv.lineItems.map((li) => ({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice })),
    };
  });
  // A new proposal starts with a cover letter drafted from the project (to be
  // reviewed and edited), the usual 50 / 40 / 10 instalments, and the app the
  // project is built on as a subscription to fill in.
  const firstName = project.contact.firstName || "";
  const descriptionLine = project.description ? project.description.trim().split("\n")[0] : "";
  const defaultCoverLetter =
    lang === "fr"
      ? `Bonjour ${firstName},\n\nMerci de me confier votre projet « ${project.name} ». Cette proposition présente ce que nous allons réaliser ensemble, comment le travail sera organisé et l'investissement requis.${descriptionLine ? `\n\nEn bref : ${descriptionLine}` : ""}\n\nLe projet avance par phases claires : chaque phase commence lorsque la précédente est terminée, pour que vous sachiez toujours où nous en sommes et ce qui suit. Un premier versement lance les travaux; les versements suivants sont facturés aux grandes étapes du projet.\n\nSi vous souhaitez ajuster quoi que ce soit, je serai heureux d'en discuter. Dès que vous êtes à l'aise, il suffit d'accepter la proposition et nous démarrons.\n\nCordialement,\nAndrew Murphy\nAndrew Murphy Online`
      : `Hi ${firstName},\n\nThank you for trusting me with "${project.name}". This proposal outlines what we will build together, how the work will be organized, and the investment involved.${descriptionLine ? `\n\nIn short: ${descriptionLine}` : ""}\n\nThe project moves forward in clear phases — each one begins once the previous one is complete — so you always know where things stand and what comes next. A first instalment starts the work, and the remaining instalments are invoiced as the project reaches its key milestones.\n\nIf you'd like to adjust anything, I'm happy to talk it through. Once you're comfortable, simply accept the proposal and we'll get started.\n\nBest regards,\nAndrew Murphy\nAndrew Murphy Online`;
  const appAnswer = ((project.customFields ?? {}) as Record<string, string | string[]>).app;
  const defaultSubscriptions = typeof appAnswer === "string" && appAnswer ? [{ name: appAnswer, amount: 0, period: "month", note: "" }] : [];
  // A new proposal starts with the usual 50 / 40 / 10 instalments.
  const proposalDefaults = {
    title: `${lang === "fr" ? "Soumission" : "Proposal"} — ${project.name}`,
    currency: "CAD",
    coverLetter: defaultCoverLetter,
    subscriptions: defaultSubscriptions,
    paymentSchedule:
      lang === "fr"
        ? [
            { label: "Dépôt — à l'acceptation", percentage: 50, amount: null, dueDate: null },
            { label: "À l'approbation de la maquette", percentage: 40, amount: null, dueDate: null },
            { label: "Au lancement", percentage: 10, amount: null, dueDate: null },
          ]
        : [
            { label: "Deposit — on acceptance", percentage: 50, amount: null, dueDate: null },
            { label: "On mock-up approval", percentage: 40, amount: null, dueDate: null },
            { label: "At launch", percentage: 10, amount: null, dueDate: null },
          ],
  };
  const emailing = { defaultComposeSource, intlLocale, hour12, emailComposeLabels: t.emailCompose };

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

      {activePhase && (
        <Card
          color="phases"
          title={
            <>
              {lang === "fr" ? "Phase active" : "Active phase"}
              <span className="truncate text-xs font-medium normal-case opacity-90">· {activePhase.name}</span>
            </>
          }
          compact
          actions={
            selectedPhase?.id === activePhase.id ? (
              <Link href={`/projects/${project.id}?phase=all`} className="rounded border border-white/40 px-2 py-0.5 text-xs font-medium normal-case text-white hover:bg-white/15">
                {lang === "fr" ? "Tout afficher" : "Show all phases"}
              </Link>
            ) : (
              <Link href={`/projects/${project.id}`} className="rounded border border-white/40 px-2 py-0.5 text-xs font-medium normal-case text-white hover:bg-white/15">
                {lang === "fr" ? "Revenir à la phase active" : "Back to active phase"}
              </Link>
            )
          }
        >
          {(() => {
            const own = project.tasks.filter((tk) => tk.phaseId === activePhase.id);
            const done = own.filter((tk) => tk.status === "DONE").length;
            const open = own.filter((tk) => tk.status !== "DONE").slice(0, 4);
            const pct = own.length > 0 ? Math.round((done / own.length) * 100) : 0;
            const nextUp = Array.isArray(project.pendingPhases) ? String(((project.pendingPhases as { name?: string }[])[0]?.name ?? "")) : "";
            return (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">{STATUS_LABELS[project.status]}</span>
                    <span className="text-soft">
                      {done}/{own.length} {lang === "fr" ? "tâches terminées" : "tasks done"}
                    </span>
                    {activePhase.dueDate && (
                      <span className="text-soft">
                        {t.projects.colDue}: {longDate(activePhase.dueDate, lang, dateLocale)}
                      </span>
                    )}
                    {nextUp && (
                      <span className="text-soft">
                        {lang === "fr" ? "Ensuite" : "Next"}: <span className="text-ink">{nextUp}</span>
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-black/5">
                    <div className="h-full rounded-full amo-card-accent" style={{ width: `${pct}%` }} />
                  </div>
                  {open.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-sm text-ink">
                      {open.map((tk) => (
                        <li key={tk.id}>• {tk.title}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            color="general"
            title={t.contactForm.cardGeneralInfo}
            compact
            actions={
              <div className="flex items-center gap-2">
                <AiExportMenu base={`/api/projects/${project.id}/ai-export`} files={PROJECT_AI_FILES} lang={lang} isAdmin={session?.user.role === "ADMIN"} />
              <ProjectGeneralDialog
                action={updateProjectGeneral.bind(null, project.id)}
                lang={lang}
                typeLabels={typeLabels}
                customTypeKeys={customTypeKeys}
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
                  completedAt: toDateInput(project.completedAt),
                  description: project.description ?? "",
                }}
              />
              </div>
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
                <p className="mt-1 text-sm text-ink">{typeLabels[project.type] ?? project.type}</p>
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
              <div>
                <p className={LABEL_CLASS}>{t.projectForm.completedDate}</p>
                <p className="mt-1 text-sm text-ink">{project.completedAt ? longDate(project.completedAt, lang, dateLocale) : "—"}</p>
              </div>
            </div>

            {project.description && (
              <div className="mt-4">
                <p className={LABEL_CLASS}>{t.projectForm.description}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{project.description}</p>
              </div>
            )}
          </Card>

          {template && template.fields.length > 0 && (
            <Card
              color="general"
              title={`${typeLabels[project.type] ?? project.type} · ${lang === "fr" ? "Détails" : "Details"}`}
              compact
              actions={
                <ProjectDetailsDialog
                  action={updateProjectCustomFields.bind(null, project.id)}
                  fields={template.fields}
                  values={(project.customFields ?? {}) as FieldValues}
                  title={`${typeLabels[project.type] ?? project.type} · ${lang === "fr" ? "Détails" : "Details"}`}
                  lang={lang}
                />
              }
            >
              <div className="grid gap-4 lg:grid-cols-3">
                {template.fields
                  .filter((f) => isFieldVisible(f, (project.customFields ?? {}) as FieldValues))
                  .map((f) => {
                    if (f.type === "spacer") return <div key={f.key} className="hidden lg:block" aria-hidden />;
                    const v = localizeValue(displayValue(((project.customFields ?? {}) as FieldValues)[f.key]), lang);
                    return (
                      <div key={f.key} className="min-w-0">
                        <p className={LABEL_CLASS}>{localizeText(f.label, lang)}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{v || "—"}</p>
                      </div>
                    );
                  })}
              </div>
            </Card>
          )}

          <PhasesCard
            projectId={project.id}
            phases={phaseRows}
            users={users}
            defaultTeamMemberIds={project.teamMembers.map((tm) => tm.userId)}
            selectedPhaseId={selectedPhaseId ?? null}
            upcoming={(Array.isArray(project.pendingPhases) ? (project.pendingPhases as { name?: string }[]) : []).map((p) => String(p.name ?? "")).filter(Boolean)}
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

          <SupplierCard projectId={project.id} rows={supplierRows} lang={lang} />

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

          {instalmentRows.length > 0 && <InstalmentsCard projectId={project.id} rows={instalmentRows} lang={lang} />}

          <ProposalsCard
            projectId={project.id}
            projectType={project.type}
            proposals={proposalRows}
            catalog={catalog}
            taxLocation={contactTaxLocation(project.contact)}
            chargeCanadianTax={billingChargeTax}
            newDefaults={proposalDefaults}
            title={t.proposals.title}
            statusLabels={t.proposals.statuses}
            lang={lang}
            emailing={emailing}
          />

          <InvoicesCard
            projectId={project.id}
            invoices={invoiceRows}
            catalog={catalog}
            taxLocation={contactTaxLocation(project.contact)}
            chargeCanadianTax={billingChargeTax}
            title={t.invoices.title}
            statusLabels={t.invoices.statuses}
            lang={lang}
            emailing={emailing}
          />
        </div>
      </div>
    </div>
  );
}
