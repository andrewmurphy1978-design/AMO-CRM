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
import { BrandCard } from "../../contacts/[id]/brand-card";
import { loadBrandRows } from "@/lib/brand-rows";
import { loadProjectFileRows } from "@/lib/file-rows";
import FilesCard from "@/components/files-card";
import TasksCard, { type TaskCardItem } from "./tasks-card";
import { ProposalsCard, InvoicesCard, type ProposalRowData, type InvoiceRowData } from "./documents-cards";
import { contactTaxLocation } from "@/lib/billing-totals";
import SupplierCard, { type SupplierRow } from "./supplier-card";
import SubscriptionsCard from "./subscriptions-card";
import type { Linkables } from "./document-links";
import { contactAddress, type RecipientOption } from "@/lib/contact-address";
import { defaultInstalments } from "@/lib/default-instalments";
import InstalmentsCard, { type InstalmentRow } from "./instalments-card";
import NewEmailButton from "../../contacts/[id]/new-email-button";
import CallsSmsCard from "../../contacts/[id]/calls-sms-card";
import { updateProjectGeneral, updateProjectNotes, updatePhaseNotes, updateProjectCustomFields } from "@/actions/projects";
import { getProjectTemplate } from "@/lib/project-template-store";
import { displayValue, isFieldVisible } from "@/lib/project-templates";
import { getTwilioConfig, contactPhoneOptions } from "@/lib/twilio";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getLinkedCalendarEvents, getEventLinkTargets } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { loadTypeInfo } from "@/lib/project-type-store";

import { frText, localizeText, localizeValue } from "@/lib/project-i18n";
import { BRAND_ITEMS, DEFAULT_BRAND_ITEMS } from "@/lib/brand-items";
import { appSubscriptionsFrom } from "@/lib/project-subscriptions";
import { typesOfProject, valuesOfType, typeColor } from "@/lib/project-templates";
import { getExchangeRates, toCad, type Currency } from "@/lib/exchange-rates";
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
  const { labels: typeLabels, keys: customTypeKeys } = await loadTypeInfo(lang);
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
    brandRows,
    fileRows,
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
    typeBlocks,
    eventLinkRows,
    projectEvents,
    relationRows,
    extraAddressRows,
    rates,
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
          // The template's order: phases in the order they were created, each phase's tasks in sequence.
          orderBy: { createdAt: "asc" },
          include: { assignee: true },
        },
        interactions: {
          orderBy: { occurredAt: "desc" },
          include: { loggedBy: true, updatedBy: true, participants: { include: { contact: true, user: true } } },
        },
        emailLinks: { orderBy: { messageDate: "desc" } },
        supplierInvoices: { orderBy: { createdAt: "desc" }, omit: { fileData: true } },
        subscriptions: { orderBy: { order: "asc" } },
        proposals: { orderBy: { createdAt: "desc" }, omit: { signedFileData: true }, include: { paymentSchedule: { orderBy: { order: "asc" } }, lineItems: { orderBy: { order: "asc" } } } },
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

    // Who a proposal can be sent to: the client and the contacts linked to them.
    const relationRows = project
      ? await db.contactRelation.findMany({ where: { OR: [{ contactId: project.contactId }, { relatedContactId: project.contactId }] }, include: { contact: true, relatedContact: true } })
      : [];
    // Every extra address on file for those contacts (the main and billing ones are on the contact).
    const recipientIds = [project?.contactId, ...relationRows.flatMap((r) => [r.contactId, r.relatedContactId])].filter((x): x is string => Boolean(x));
    const extraAddressRows = recipientIds.length > 0 ? await db.contactAddress.findMany({ where: { contactId: { in: recipientIds } }, orderBy: { order: "asc" } }) : [];
    // Everything linked to the project (not just the selected phase), with the proposal /
    // invoice each calendar event is linked to, for the document dialogs.
    const eventLinkRows = project ? await db.calendarEventLink.findMany({ where: { projectId: project.id }, select: { googleEventId: true, proposalId: true, invoiceId: true } }) : [];
    const projectEvents = project && phaseParam ? await getLinkedCalendarEvents(db, { projectId: project.id }, googleAccessToken) : calendarEvents;
    // CAD equivalents for proposals / invoices issued in another currency.
    const rates = await getExchangeRates(db).catch(() => null);
    // One Details card per selected type, in the order of the types.
    const typeBlocks = project
      ? await Promise.all(
          typesOfProject(project).map(async (type) => ({ type, template: await getProjectTemplate(db, type), values: valuesOfType(project, type) }))
        )
      : [];
    // Apps & subscriptions start from the apps chosen in the Project details: fill
    // them in for a project that has none yet (e.g. created before this card existed).
    if (project && project.subscriptions.length === 0) {
      const seen = new Set<string>();
      const subs = typeBlocks
        .flatMap((tb) => appSubscriptionsFrom(tb.template, tb.values))
        .filter((x) => (seen.has(x.name.toLowerCase()) ? false : (seen.add(x.name.toLowerCase()), true)));
      if (subs.length > 0) {
        await db.projectSubscription.createMany({ data: subs.map((x, order) => ({ ...x, projectId: project.id, order })) });
        project.subscriptions = await db.projectSubscription.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } });
      }
    }

    const brandRows = project ? await loadBrandRows(db, project.contactId) : [];
    const fileRows = project ? await loadProjectFileRows(db, { id: project.id, name: project.name }) : [];

    return {
      project,
      brandRows,
      fileRows,
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
      typeBlocks,
      eventLinkRows,
      projectEvents,
      relationRows,
      extraAddressRows,
      rates,
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
  // The client's Brand card: at the bottom, but right under the Phases card while the Brand phase is the active one.
  const brandActive = Boolean(activePhase && /(^|—\s*)brand$/i.test(activePhase.name.trim()));
  const brandCard = (
    <BrandCard
      contactId={project.contactId}
      lang={lang}
      items={brandRows}
    />
  );
  const selectedPhase =
    phaseParam === "all" ? null : (project.phases.find((ph) => ph.id === phaseParam) ?? (phaseParam ? null : activePhase));
  const selectedPhaseId = selectedPhase?.id;
  const inPhase = <T extends { phaseId: string | null }>(rows: T[]): T[] => (selectedPhaseId ? rows.filter((r) => r.phaseId === selectedPhaseId) : rows);
  const visibleTasks = inPhase(project.tasks);
  const visibleEmailLinks = inPhase(project.emailLinks);
  const visibleInteractions = inPhase(project.interactions);

  // What can be linked to a proposal / invoice: the project's emails, calendar events and calls & texts.
  const fmtWhen = (d: Date | string | null) => (d ? new Date(d).toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" }) : "");
  const eventLinkById = new Map(eventLinkRows.map((r) => [r.googleEventId, r]));
  const linkables: Linkables = {
    emails: project.emailLinks.map((l) => ({ id: l.id, title: l.subject || "(no subject)", meta: [l.fromLabel, fmtWhen(l.messageDate)].filter(Boolean).join(" · "), proposalId: l.proposalId, invoiceId: l.invoiceId })),
    events: projectEvents.map((e) => ({ id: e.id, title: e.title || "(no title)", meta: fmtWhen(e.start), proposalId: eventLinkById.get(e.id)?.proposalId ?? null, invoiceId: eventLinkById.get(e.id)?.invoiceId ?? null })),
    calls: project.interactions
      .filter((i) => i.type === "CALL" || i.type === "MEETING" || i.type === "SMS")
      .map((i) => ({ id: i.id, title: `${i.type === "SMS" ? "SMS" : i.type === "CALL" ? (lang === "fr" ? "Appel" : "Call") : lang === "fr" ? "Rencontre" : "Meeting"}${i.subject ? ` — ${i.subject}` : i.notes ? ` — ${i.notes.slice(0, 60)}` : ""}`, meta: fmtWhen(i.occurredAt), proposalId: i.proposalId, invoiceId: i.invoiceId })),
  };

  const toRecipient = (c: typeof project.contact, relation: string): RecipientOption => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || "—",
    company: c.company,
    relation,
    emails: [...new Set([c.email, c.email2, ...c.extraEmails, c.billingEmail].filter((e): e is string => Boolean(e)))],
    address: contactAddress(c),
    billingAddress: contactAddress(c, true),
    billingEmail: c.billingEmail,
    addresses: [
      { label: lang === "fr" ? "Adresse principale" : "Main address", text: contactAddress(c) },
      { label: lang === "fr" ? "Adresse de facturation" : "Billing address", text: c.billingAddress || c.billingCity ? contactAddress(c, true) : "" },
      ...extraAddressRows
        .filter((a) => a.contactId === c.id)
        .map((a) => ({ label: a.description || (lang === "fr" ? "Autre adresse" : "Other address"), text: [a.address, [a.city, a.state, a.zip].filter(Boolean).join(" "), a.country].filter(Boolean).join("\n") })),
    ].filter((a) => a.text),
  });
  const recipients: RecipientOption[] = [
    toRecipient(project.contact, lang === "fr" ? "Client" : "Client"),
    ...relationRows.map((r) => {
      const other = r.contactId === project.contactId ? r.relatedContact : r.contact;
      return toRecipient(other as typeof project.contact, r.relationType);
    }),
  ].filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i);

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

  // Keep the stored (English) phase names: the AI prompt buttons are matched on them.
  const originalPhaseNames = new Map(project.phases.map((p) => [p.id, p.name.indexOf(" — ") > 0 ? p.name.slice(p.name.indexOf(" — ") + 3) : p.name]));
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

  // A phase's first task (in creation order) carries the AI prompt button when the phase has a prompt.
  const PROMPT_PHASE = /^(research|brand|mock-?up|building pages|building funnels|blog setup|writing|template)$/i;
  const phaseById = new Map(project.phases.map((p) => [p.id, p]));
  const headTaskIds = new Set<string>();
  const firstByPhase = new Map<string, (typeof project.tasks)[number]>();
  for (const tk of project.tasks) {
    if (!tk.phaseId) continue;
    const cur = firstByPhase.get(tk.phaseId);
    if (!cur || tk.createdAt < cur.createdAt || (tk.createdAt.getTime() === cur.createdAt.getTime() && tk.id < cur.id)) firstByPhase.set(tk.phaseId, tk);
  }
  for (const [phaseId, tk] of firstByPhase) {
    const name = phaseById.get(phaseId)?.name ?? "";
    const sepAt = name.indexOf(" — ");
    // (display names may be translated, so match on the stored English name kept in originalPhaseNames)
    if (PROMPT_PHASE.test(sepAt > 0 ? name.slice(sepAt + 3) : name) || PROMPT_PHASE.test(originalPhaseNames.get(phaseId) ?? "")) headTaskIds.add(tk.id);
  }
  const taskItems: TaskCardItem[] = visibleTasks.map((task) => ({
    id: task.id,
    aiPhaseId: headTaskIds.has(task.id) ? task.phaseId : null,
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
      aiPrompt: task.aiPrompt ?? "",
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
  const cadOf = (amount: number, currency: string): number | null =>
    rates && currency !== "CAD" && currency in rates ? toCad(amount, currency as Currency, rates) : null;
  const proposalRows: ProposalRowData[] = project.proposals.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    currency: p.currency,
    totalAmount: p.totalAmount,
    totalCad: cadOf(p.totalAmount, p.currency),
    approvedAt: iso(p.approvedAt),
    recipientContactId: p.recipientContactId,
    recipientEmail: p.recipientEmail,
    recipientAddress: p.recipientAddress,
    signedFileName: p.signedFileName,
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
      totalCad: cadOf(inv.totalAmount || inv.amount, inv.currency),
      invoiceDate: iso(inv.invoiceDate),
      dueDate: iso(inv.dueDate),
      approvedAt: iso(inv.approvedAt),
      notes: inv.notes,
      recipientContactId: inv.recipientContactId,
      recipientEmail: inv.recipientEmail,
      recipientAddress: inv.recipientAddress,
      instalmentLabel: inv.instalment ? `${lang === "fr" ? "Versement" : "Instalment"} ${ids.indexOf(inv.instalment.id) + 1}/${ids.length} · ${inv.instalment.label}` : null,
      lineItems: inv.lineItems.map((li) => ({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice })),
    };
  });
  // A new proposal starts with a cover letter drafted from the project (to be
  // reviewed and edited), the usual 50 / 40 / 10 instalments, and the app the
  // project is built on as a subscription to fill in.
  const firstName = project.contact.firstName || "";
  const descriptionLine = project.description ? project.description.trim().split("\n")[0] : "";
  // The proposal is written in the client's language (not the reader's), and uses the
  // client's currency and payment schedule when the contact has them.
  const docLang: "en" | "fr" = (project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
  const defaultCoverLetter =
    docLang === "fr"
      ? `Bonjour ${firstName},\n\nMerci de me confier votre projet « ${project.name} ». Cette proposition présente ce que nous allons réaliser ensemble, comment le travail sera organisé et l'investissement requis.${descriptionLine ? `\n\nEn bref : ${descriptionLine}` : ""}\n\nLe projet avance par phases claires : chaque phase commence lorsque la précédente est terminée, pour que vous sachiez toujours où nous en sommes et ce qui suit. Un premier versement lance les travaux; les versements suivants sont facturés aux grandes étapes du projet.\n\nSi vous souhaitez ajuster quoi que ce soit, je serai heureux d'en discuter. Dès que vous êtes à l'aise, il suffit d'accepter la proposition et nous démarrons.\n\nCordialement,\nAndrew Murphy\nAndrew Murphy Online`
      : `Hi ${firstName},\n\nThank you for trusting me with "${project.name}". This proposal outlines what we will build together, how the work will be organized, and the investment involved.${descriptionLine ? `\n\nIn short: ${descriptionLine}` : ""}\n\nThe project moves forward in clear phases — each one begins once the previous one is complete — so you always know where things stand and what comes next. A first instalment starts the work, and the remaining instalments are invoiced as the project reaches its key milestones.\n\nIf you'd like to adjust anything, I'm happy to talk it through. Once you're comfortable, simply accept the proposal and we'll get started.\n\nBest regards,\nAndrew Murphy\nAndrew Murphy Online`;
  // The proposal's Apps & subscriptions come from the project's Apps & subscriptions card.
  const defaultSubscriptions = project.subscriptions.map((x) => ({ name: x.name, amount: x.amount, period: x.period, note: x.note }));
  // A new proposal starts with the usual 50 / 40 / 10 instalments.
  // When the project includes a brand, the proposal starts with a "Brand creation" line (priced from
  // the price list when it has a brand item) listing what the brand includes.
  const brandCatalogItem = catalog.find((c) => /brand|marque/i.test(c.name));
  const brandLabels = BRAND_ITEMS.filter((b) => (project.brandItems.length > 0 ? project.brandItems : DEFAULT_BRAND_ITEMS).includes(b.key)).map((b) => (docLang === "fr" ? b.labelFr : b.label));
  const defaultLineItems = project.createBrand
    ? [
        {
          description: docLang === "fr" ? "Création de l'image de marque" : "Brand creation",
          details: `${docLang === "fr" ? "Comprend : " : "Includes: "}${brandLabels.join(", ")}.`,
          quantity: 1,
          unitPrice: brandCatalogItem?.unitPrice ?? 0,
        },
      ]
    : [];
  const proposalDefaults = {
    lineItems: defaultLineItems,
    title: `${docLang === "fr" ? "Soumission" : "Proposal"} — ${project.name}`,
    currency: project.contact.preferredCurrency || "CAD",
    coverLetter: defaultCoverLetter,
    subscriptions: defaultSubscriptions,
    paymentSchedule: defaultInstalments(project.contact.paymentSchedule, docLang),
  };
  // While the project is in Proposal status the Proposals card comes first in the right column; once
  // the proposal is accepted the payments (Instalments, Invoices) take over the top.
  // Pending documents (not yet accepted / paid) sit right under the Tasks card; settled ones drop to the
  // bottom of the right column.
  const proposalsPending = project.proposals.some((p) => p.status !== "ACCEPTED" && p.status !== "DECLINED") || (project.proposals.length === 0 && project.status === "PROPOSAL");
  const invoicesPending = project.invoices.some((i) => i.status !== "PAID");
  const upcomingTasks = (Array.isArray(project.pendingPhases) ? (project.pendingPhases as { tasks?: string[] }[]) : []).reduce((n, ph) => n + (Array.isArray(ph.tasks) ? ph.tasks.length : 0), 0);
  const doneTasks = project.tasks.filter((tk) => tk.status === "DONE").length;
  const totalTasks = project.tasks.length + upcomingTasks;
  const progress = { done: doneTasks, upcoming: upcomingTasks, total: totalTasks, pct: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0 };
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
    <div className="space-y-3 sm:space-y-6">
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

      <div className="grid grid-cols-1 gap-3 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-3 sm:space-y-6 lg:col-span-2">
          <PhasesCard
            projectId={project.id}
            phases={phaseRows}
            users={users}
            defaultTeamMemberIds={project.teamMembers.map((tm) => tm.userId)}
            selectedPhaseId={selectedPhaseId ?? null}
            lang={lang}
            summary={
              activePhase ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                      {lang === "fr" ? "Phase active" : "Active phase"} · <span className="normal-case text-ink">{activePhase.name}</span>
                    </span>
                    {selectedPhase?.id === activePhase.id ? (
              <Link href={`/projects/${project.id}?phase=all`} className="rounded border border-white/40 px-2 py-0.5 text-xs font-medium normal-case text-white hover:bg-white/15">
                {lang === "fr" ? "Tout afficher" : "Show all phases"}
              </Link>
            ) : (
              <Link href={`/projects/${project.id}`} className="rounded border border-white/40 px-2 py-0.5 text-xs font-medium normal-case text-white hover:bg-white/15">
                {lang === "fr" ? "Revenir à la phase active" : "Back to active phase"}
              </Link>
            )}
                  </div>
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
                      <span className="ml-auto text-right text-soft">
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
                </div>
              ) : null
            }
          />


          {brandActive && brandCard}

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
                  types: typesOfProject(project),
                  contactId: project.contactId,
                  ownerId: project.ownerId ?? "",
                  supervisorId: project.supervisorId ?? "",
                  teamMemberIds: project.teamMembers.map((tm) => tm.userId),
                  startDate: toDateInput(project.startDate),
                  dueDate: toDateInput(project.dueDate),
                  completedAt: toDateInput(project.completedAt),
                  subscriptionEmail: project.subscriptionEmail ?? "",
                  createBrand: project.createBrand,
                  brandItems: project.brandItems,
                  accountMode: project.accountMode ?? "",
                  description: project.description ?? "",
                }}
              />
              </div>
            }
          >
            <h1 className="font-display text-xl font-semibold text-ink">{project.name}</h1>

            {/* Whole-project progress: finished tasks out of every task, counting the phases and tasks not created yet. */}
            <div>
              <div className="flex items-baseline justify-between gap-2 text-xs text-soft">
                <span className="font-semibold uppercase tracking-wide">{lang === "fr" ? "Progression du projet" : "Project progress"}</span>
                <span>
                  {progress.pct}% · {progress.done}/{progress.total} {lang === "fr" ? "tâches" : "tasks"}
                  {progress.upcoming > 0 && ` (${progress.upcoming} ${lang === "fr" ? "pas encore créées" : "not created yet"})`}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-black/10" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-amo-lime transition-all" style={{ width: `${progress.pct}%` }} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <p className={LABEL_CLASS}>{t.projects.colStatus}</p>
                <p className="mt-1 text-sm text-ink">{STATUS_LABELS[project.status]}</p>
              </div>
              <div>
                <p className={LABEL_CLASS}>{typesOfProject(project).length > 1 ? "Types" : t.projects.colType}</p>
                <p className="mt-1 text-sm text-ink">{typesOfProject(project).map((ty) => typeLabels[ty] ?? ty).join(" · ")}</p>
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

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div>
                <p className={LABEL_CLASS}>{lang === "fr" ? "Image de marque" : "Brand"}</p>
                <p className="mt-1 text-sm text-ink">{project.createBrand ? (lang === "fr" ? "À créer" : "To be created") : "—"}</p>
              </div>
              <div className="lg:col-span-2">
                <p className={LABEL_CLASS}>{lang === "fr" ? "Comptes du client" : "Client accounts"}</p>
                <p className="mt-1 text-sm text-ink">
                  {project.accountMode === "CLIENT"
                    ? lang === "fr" ? "Le client gère ses propres accès" : "Client controls their own credentials"
                    : project.accountMode === "MANAGED"
                      ? lang === "fr" ? "Sous-compte géré (frais mensuels)" : "Managed sub-account (monthly fee)"
                      : "—"}
                </p>
                <p className={`${LABEL_CLASS} mt-3`}>{lang === "fr" ? "Courriel à utiliser pour les abonnements" : "Email to use for subscriptions"}</p>
                <p className="mt-1 text-sm text-ink">{project.subscriptionEmail || "—"}</p>
              </div>
            </div>


            {project.description && (
              <div className="mt-4">
                <p className={LABEL_CLASS}>{t.projectForm.description}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{project.description}</p>
              </div>
            )}
          </Card>

          {typeBlocks
            .filter((tb) => tb.template.fields.length > 0)
            .map(({ type: ty, template, values }) => (
              <Card
                key={ty}
                color="general"
                headerColor={typeColor(ty, template)}
                title={`${typeLabels[ty] ?? ty} · ${lang === "fr" ? "Détails" : "Details"}`}
                compact
                actions={
                  <ProjectDetailsDialog
                    action={updateProjectCustomFields.bind(null, project.id, ty)}
                    fields={template.fields}
                    values={values}
                    type={ty}
                    title={`${typeLabels[ty] ?? ty} · ${lang === "fr" ? "Détails" : "Details"}`}
                    lang={lang}
                  />
                }
              >
                <div className="grid gap-4 lg:grid-cols-3">
                  {template.fields
                    .filter((f) => isFieldVisible(f, values, template.fields) || f.keepSpace)
                    .map((f) => {
                      if (f.keepSpace && !isFieldVisible(f, values, template.fields)) return <div key={f.key} className="hidden lg:block" aria-hidden />;
                      if (f.type === "spacer") return <div key={f.key} className="hidden lg:block" aria-hidden />;
                      const v = localizeValue(displayValue(values[f.key]), lang);
                      return (
                        <div key={f.key} className="min-w-0">
                          <p className={LABEL_CLASS}>{localizeText(f.label, lang)}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{v || "—"}</p>
                        </div>
                      );
                    })}
                </div>
              </Card>
            ))}

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

          <SubscriptionsCard
            key={project.subscriptions.map((x) => x.id).join(",")}
            projectId={project.id}
            initial={project.subscriptions.map((x) => ({ name: x.name, amount: x.amount, period: x.period, note: x.note }))}
            lang={lang}
          />

          <SupplierCard projectId={project.id} rows={supplierRows} lang={lang} />

          <TechStackCard contact={project.contact} lang={lang} />

          <DomainsCard contact={project.contact} lang={lang} />

          <FilesCard scope={{ projectId: project.id }} files={fileRows} lang={lang} />

          {!brandActive && brandCard}
        </div>

        <div className="flex min-w-0 flex-col gap-3 sm:gap-6">
          <div style={{ order: 0 }}>
          <TasksCard
            projectId={project.id}
            tasks={taskItems}
            users={users}
            phases={project.phases.map((p) => ({ id: p.id, name: p.name }))}
            lang={lang}
          />
          </div>

          <div style={{ order: 4 }}>
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
          </div>

          <div style={{ order: 5 }}>
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
          </div>

          <div style={{ order: 6 }}>
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
              summary: i.summary,
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
          </div>

          {instalmentRows.length > 0 && (
            <div style={{ order: 3 }}>
              <InstalmentsCard projectId={project.id} rows={instalmentRows} lang={lang} />
            </div>
          )}

          <div style={{ order: proposalsPending ? 1 : 7 }}>
          <ProposalsCard
            projectId={project.id}
            projectType={typesOfProject(project).join(",")}
            proposals={proposalRows}
            catalog={catalog}
            taxLocation={contactTaxLocation(project.contact)}
            chargeCanadianTax={billingChargeTax}
            newDefaults={proposalDefaults}
            title={t.proposals.title}
            statusLabels={t.proposals.statuses}
            lang={lang}
            emailing={emailing}
            linkables={linkables}
            recipients={recipients}
          />
          </div>

          <div style={{ order: invoicesPending ? 2 : 8 }}>
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
            linkables={linkables}
            recipients={recipients}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
