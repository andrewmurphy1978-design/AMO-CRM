"use server";

import { onProposalAccepted, ensureInstalmentInvoices } from "@/lib/project-progress";
import { buildInvoiceEmail } from "@/lib/invoice-email";
import { sendEmailAction } from "@/actions/email-messages";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { computeBillingTotals, contactTaxLocation, type LineItemInput } from "@/lib/billing-totals";
import { getProjectTemplate } from "@/lib/project-template-store";
import { displayValue, isFieldVisible, type FieldValues } from "@/lib/project-templates";
import { loadProposalPdfData } from "@/lib/document-data";
import { buildProposalPdf } from "@/lib/proposal-pdf";
import { draftProposalWithAI, type AIProposalDraft } from "@/lib/proposal-ai";

const ProposalSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required"),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]),
  amount: z.string().trim().optional(),
  currency: z.string().trim().min(1),
  notes: z.string().trim().optional(),
});

async function contactIdForProject(db: PrismaClient, projectId: string): Promise<string> {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { contactId: true } });
  return project.contactId;
}

function revalidateBoth(projectId: string, contactId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/contacts/${contactId}`);
}

// The Proposal phase's "Prepare the proposal" / "Present (send) the proposal" tasks
// follow the proposal: approving completes the first, sending the second.
const PREPARE_TASK = /^(prepare the proposal|préparer la soumission|préparer la proposition)/i;
const SEND_TASK = /^(present \(send\) the proposal|présenter \(envoyer\) la soumission|présenter \(envoyer\) la proposition)/i;
async function setProposalTask(db: PrismaClient, projectId: string, which: RegExp, done: boolean) {
  const tasks = await db.task.findMany({ where: { projectId }, select: { id: true, title: true, status: true } });
  const ids = tasks.filter((t) => which.test(t.title) && (done ? t.status !== "DONE" : t.status === "DONE")).map((t) => t.id);
  if (ids.length > 0) await db.task.updateMany({ where: { id: { in: ids } }, data: { status: done ? "DONE" : "TODO", completedAt: done ? new Date() : null } });
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function createProposal(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = ProposalSchema.parse({
      projectId: String(formData.get("projectId") ?? ""),
      title: String(formData.get("title") ?? "").trim(),
      status: String(formData.get("status") ?? "DRAFT"),
      amount: String(formData.get("amount") ?? "").trim() || undefined,
      currency: String(formData.get("currency") ?? "CAD").trim() || "CAD",
      notes: String(formData.get("notes") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  // Quick-add stays a flat, untaxed amount — the full tax/line-item
  // breakdown only applies to proposals built through the full editor,
  // which is where a currency/jurisdiction is actually chosen deliberately.
  const amount = data.amount ? Number(data.amount) : null;
  const contactId = await withScopedPrismaClient(async (db) => {
    await db.proposal.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        status: data.status,
        amount,
        subtotal: amount ?? 0,
        totalAmount: amount ?? 0,
        currency: data.currency,
        notes: data.notes,
        sentAt: data.status === "SENT" ? new Date() : null,
      },
    });
    return contactIdForProject(db, data.projectId);
  });

  revalidateBoth(data.projectId, contactId);
  return { success: t.actions.proposalCreated };
}

export async function updateProposalStatus(proposalId: string, projectId: string, status: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const now = new Date();
  const contactId = await withScopedPrismaClient(async (db) => {
    await db.proposal.update({
      where: { id: proposalId },
      data: {
        status: status as "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED",
        ...(status === "SENT" ? { sentAt: now } : {}),
        ...(status === "ACCEPTED" || status === "DECLINED" ? { respondedAt: now } : {}),
      },
    });
    if (status === "ACCEPTED") await onProposalAccepted(db, projectId);
    return contactIdForProject(db, projectId);
  });

  revalidateBoth(projectId, contactId);
}

// Ticks (or unticks) an instalment of the accepted proposal's payment schedule.
// Paying the 1st / last instalment is what moves the project through its
// lifecycle (see lib/project-progress.ts).
export async function setInstalmentPaid(rowId: string, projectId: string, paid: boolean): Promise<{ invoiceEmail?: "sent" | "failed" | "no_recipient"; error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const { contactId, emailInvoiceId } = await withScopedPrismaClient(async (db) => {
    await db.proposalPaymentScheduleItem.update({ where: { id: rowId }, data: { paid, paidAt: paid ? new Date() : null } });
    let emailInvoiceId: string | null = null;
    if (paid) {
      // The invoice for this instalment is issued automatically when the payment is
      // recorded (if it doesn't exist yet), marked paid, and sent to the client.
      const row = await db.proposalPaymentScheduleItem.findUnique({ where: { id: rowId }, select: { proposalId: true } });
      if (row) {
        const rows = await db.proposalPaymentScheduleItem.findMany({ where: { proposalId: row.proposalId }, orderBy: { order: "asc" }, select: { id: true } });
        const index = rows.findIndex((r) => r.id === rowId) + 1;
        if (index > 0) await ensureInstalmentInvoices(db, projectId, index);
      }
      const invoice = await db.invoice.findFirst({ where: { instalmentId: rowId } });
      if (invoice) {
        const now = new Date();
        await db.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", paidAt: invoice.paidAt ?? now, approvedAt: invoice.approvedAt ?? now } });
        if (!invoice.sentAt) emailInvoiceId = invoice.id;
      }
    } else {
      await db.invoice.updateMany({ where: { instalmentId: rowId, status: "PAID" }, data: { status: "SENT", paidAt: null } });
    }
    if (paid) await onProposalAccepted(db, projectId);
    return { contactId: await contactIdForProject(db, projectId), emailInvoiceId };
  });

  // Send the (paid) invoice to the client with the PDF attached.
  let invoiceEmail: "sent" | "failed" | "no_recipient" | undefined;
  if (emailInvoiceId) {
    const info = await withScopedPrismaClient((db) => buildInvoiceEmail(db, emailInvoiceId, projectId));
    if (info.error || !info.to || !info.attachment) {
      invoiceEmail = info.to ? "failed" : "no_recipient";
    } else {
      const res = await sendEmailAction({
        inReplyToId: null,
        threadId: null,
        messageIdHeader: null,
        references: [],
        to: [info.to],
        cc: [],
        bcc: [],
        subject: info.subject ?? "",
        fromOverride: null,
        html: info.html ?? "",
        attachments: [info.attachment],
      });
      if ("success" in res) {
        invoiceEmail = "sent";
        await withScopedPrismaClient((db) => db.invoice.update({ where: { id: emailInvoiceId }, data: { sentAt: new Date() } }));
      } else {
        invoiceEmail = "failed";
      }
    }
  }
  revalidateBoth(projectId, contactId);
  return { invoiceEmail };
}

export async function deleteProposal(proposalId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const contactId = await withScopedPrismaClient(async (db) => {
    const contactId = await contactIdForProject(db, projectId);
    await db.proposal.delete({ where: { id: proposalId } });
    return contactId;
  });
  revalidateBoth(projectId, contactId);
}

// --- Full proposal builder (line items, tax, payment schedule, AI draft) ---

const CURRENCIES = ["CAD", "USD", "EUR", "GBP"] as const;

const FullProposalSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required"),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]),
  currency: z.enum(CURRENCIES),
  coverLetter: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function readLineItems(formData: FormData): (LineItemInput & { description: string; details: string | null })[] {
  const descriptions = formData.getAll("lineItemDescription").map(String);
  const quantities = formData.getAll("lineItemQuantity").map(String);
  const unitPrices = formData.getAll("lineItemUnitPrice").map(String);
  const detailsList = formData.getAll("lineItemDetails").map(String);
  const items: { description: string; quantity: number; unitPrice: number; details: string | null }[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = descriptions[i].trim();
    const unitPrice = Number(unitPrices[i]);
    if (!description || Number.isNaN(unitPrice)) continue;
    const quantity = Number(quantities[i]);
    items.push({ description, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, unitPrice, details: (detailsList[i] ?? "").trim() || null });
  }
  return items;
}

function readPaymentSchedule(formData: FormData): {
  label: string;
  percentage: number | null;
  amount: number | null;
  dueDate: Date | null;
}[] {
  const labels = formData.getAll("scheduleLabel").map(String);
  const percentages = formData.getAll("schedulePercentage").map(String);
  const amounts = formData.getAll("scheduleAmount").map(String);
  const dueDates = formData.getAll("scheduleDueDate").map(String);
  const rows: { label: string; percentage: number | null; amount: number | null; dueDate: Date | null }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim();
    if (!label) continue;
    const percentage = percentages[i] ? Number(percentages[i]) : null;
    const amount = amounts[i] ? Number(amounts[i]) : null;
    const dueDate = dueDates[i] ? new Date(dueDates[i]) : null;
    rows.push({
      label,
      percentage: percentage !== null && !Number.isNaN(percentage) ? percentage : null,
      amount: amount !== null && !Number.isNaN(amount) ? amount : null,
      dueDate,
    });
  }
  return rows;
}

function readSubscriptions(formData: FormData): { name: string; amount: number; period: string; note: string }[] {
  const names = formData.getAll("subName").map(String);
  const amounts = formData.getAll("subAmount").map(String);
  const periods = formData.getAll("subPeriod").map(String);
  const notes = formData.getAll("subNote").map(String);
  const out: { name: string; amount: number; period: string; note: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i].trim();
    if (!name) continue;
    const amount = Number(amounts[i]);
    out.push({ name, amount: Number.isFinite(amount) && amount >= 0 ? amount : 0, period: ["month", "year", "once"].includes(periods[i]) ? periods[i] : "month", note: (notes[i] ?? "").trim() });
  }
  return out;
}

async function computeProposalTotals(db: PrismaClient, projectId: string, lineItems: LineItemInput[]) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { contact: true } });
  const billingSettings = await db.billingSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
  const location = contactTaxLocation(project.contact);
  return { project, totals: computeBillingTotals(lineItems, location, billingSettings.chargeCanadianTax) };
}

export async function createFullProposal(
  _prevState: { error?: string; success?: string; proposalId?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string; proposalId?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = FullProposalSchema.parse({
      projectId: String(formData.get("projectId") ?? ""),
      title: String(formData.get("title") ?? "").trim(),
      status: String(formData.get("status") ?? "DRAFT"),
      currency: String(formData.get("currency") ?? "CAD"),
      coverLetter: String(formData.get("coverLetter") ?? "").trim() || undefined,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const lineItems = readLineItems(formData);
  const paymentSchedule = readPaymentSchedule(formData);
  const subscriptions = readSubscriptions(formData);

  const proposal = await withScopedPrismaClient(async (db) => {
    const { project, totals } = await computeProposalTotals(db, data.projectId, lineItems);

    const proposal = await db.proposal.create({
      data: {
        projectId: data.projectId,
        title: data.title,
        status: data.status,
        currency: data.currency,
        coverLetter: data.coverLetter,
        notes: data.notes,
        subscriptions: subscriptions as never,
        subtotal: totals.subtotal,
        gstAmount: totals.gst,
        qstAmount: totals.qst,
        hstAmount: totals.hst,
        taxAmount: totals.total,
        totalAmount: totals.totalAmount,
        amount: totals.totalAmount,
        sentAt: data.status === "SENT" ? new Date() : null,
      },
    });

    if (lineItems.length > 0) {
      await db.proposalLineItem.createMany({
        data: lineItems.map((li, i) => ({ proposalId: proposal.id, ...li, order: i })),
      });
    }
    if (paymentSchedule.length > 0) {
      await db.proposalPaymentScheduleItem.createMany({
        data: paymentSchedule.map((row, i) => ({ proposalId: proposal.id, ...row, order: i })),
      });
    }

    revalidateBoth(data.projectId, project.contactId);
    return proposal;
  });

  // The project page's dialog stays where it is (no redirect).
  if (formData.get("inline") === "1") return { success: t.actions.proposalCreated, proposalId: proposal.id };
  redirect(`/projects/${data.projectId}/proposals/${proposal.id}`);
}

export async function updateFullProposal(
  proposalId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = FullProposalSchema.parse({
      projectId: String(formData.get("projectId") ?? ""),
      title: String(formData.get("title") ?? "").trim(),
      status: String(formData.get("status") ?? "DRAFT"),
      currency: String(formData.get("currency") ?? "CAD"),
      coverLetter: String(formData.get("coverLetter") ?? "").trim() || undefined,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const lineItems = readLineItems(formData);
  const paymentSchedule = readPaymentSchedule(formData);
  const subscriptions = readSubscriptions(formData);

  let locked = false;
  await withScopedPrismaClient(async (db) => {
    const existing = await db.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    // Once the proposal has gone to the client it can no longer be edited.
    if (existing.status !== "DRAFT") {
      locked = true;
      return;
    }
    const { project, totals } = await computeProposalTotals(db, data.projectId, lineItems);

    await db.proposal.update({
      where: { id: proposalId },
      data: {
        title: data.title,
        status: data.status,
        currency: data.currency,
        coverLetter: data.coverLetter,
        notes: data.notes,
        subscriptions: subscriptions as never,
        subtotal: totals.subtotal,
        gstAmount: totals.gst,
        qstAmount: totals.qst,
        hstAmount: totals.hst,
        taxAmount: totals.total,
        totalAmount: totals.totalAmount,
        amount: totals.totalAmount,
        sentAt: data.status === "SENT" ? new Date() : existing.sentAt,
        respondedAt:
          data.status === "ACCEPTED" || data.status === "DECLINED"
            ? new Date()
            : existing.respondedAt,
      },
    });

    // Full replace, not a diff — same reasoning as the Contact form's
    // social-links resync (small, order-sensitive lists with nothing else
    // referencing a row by id).
    await db.proposalLineItem.deleteMany({ where: { proposalId } });
    if (lineItems.length > 0) {
      await db.proposalLineItem.createMany({
        data: lineItems.map((li, i) => ({ proposalId, ...li, order: i })),
      });
    }
    await db.proposalPaymentScheduleItem.deleteMany({ where: { proposalId } });
    if (paymentSchedule.length > 0) {
      await db.proposalPaymentScheduleItem.createMany({
        data: paymentSchedule.map((row, i) => ({ proposalId, ...row, order: i })),
      });
    }

    if (data.status === "ACCEPTED") await onProposalAccepted(db, data.projectId);

    revalidateBoth(data.projectId, project.contactId);
  });

  if (locked) return { error: "This proposal is approved or sent — return it to draft to edit it." };
  revalidatePath(`/projects/${data.projectId}/proposals/${proposalId}`);
  return { success: t.actions.proposalUpdated };
}

// Called directly from the client form (not a <form action>) — a plain
// async function, not FormData-shaped, since it just returns a draft for
// the form to pre-fill rather than persisting anything.
export async function draftProposalAI(projectId: string, brief: string): Promise<AIProposalDraft | { error: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  try {
  return await withScopedPrismaClient(async (db) => {
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { contact: true } });
    const servicesCatalog = await db.servicePriceListItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    const clientLabel =
      [project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") ||
      project.contact.company ||
      project.contact.email ||
      "";
    const language: "en" | "fr" = (project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";

    // With no brief typed, work from what the CRM already knows: the project
    // (type, description, custom answers) and what's been written for AI about
    // the client (voice, preferences, background).
    let fullBrief = brief.trim();
    if (!fullBrief) {
      const template = await getProjectTemplate(db, project.type);
      const answers = (project.customFields ?? {}) as FieldValues;
      const details = template.fields
        .filter((f) => f.type !== "spacer")
        .filter((f) => isFieldVisible(f, answers, template.fields))
        .map((f) => `${f.label}: ${displayValue(answers[f.key])}`)
        .filter((line) => !line.endsWith(": "));
      const voice = await db.contactBrandItem.findMany({ where: { contactId: project.contactId, category: "voice" }, select: { label: true, value: true } });
      fullBrief = [
        `Project type: ${project.type}`,
        project.description ? `Project description: ${project.description}` : "",
        details.length ? `Project details:\n${details.join("\n")}` : "",
        project.contact.company ? `Client company: ${project.contact.company}` : "",
        project.contact.industry ? `Client industry: ${project.contact.industry}` : "",
        project.contact.aiDetails ? `Background about the client:\n${project.contact.aiDetails}` : "",
        voice.length ? `Client brand voice:\n${voice.map((v) => `${v.label}: ${v.value}`).join("\n")}` : "",
        `Client first name: ${project.contact.firstName ?? ""}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    return draftProposalWithAI(db, {
      clientLabel,
      projectName: project.name,
      currency: project.contact.preferredCurrency || "CAD",
      servicesCatalog,
      brief: fullBrief,
      language,
    });
  });
  } catch (error) {
    console.error("draftProposalAI failed", error);
    return { error: `Couldn't prepare the AI draft. (${error instanceof Error ? error.message.slice(0, 160) : "unknown error"})` };
  }
}

// ---- internal approval, then send

// Sign-off before anything goes to the client.
export async function approveProposal(proposalId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const contactId = await withScopedPrismaClient(async (db) => {
    await db.proposal.update({ where: { id: proposalId }, data: { status: "APPROVED", approvedAt: new Date() } });
    await setProposalTask(db, projectId, PREPARE_TASK, true);
    return contactIdForProject(db, projectId);
  });
  revalidateBoth(projectId, contactId);
}

export async function unapproveProposal(proposalId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const contactId = await withScopedPrismaClient(async (db) => {
    // Only a proposal that hasn't gone out can go back to draft.
    const p = await db.proposal.findUnique({ where: { id: proposalId }, select: { status: true } });
    if (p?.status && p.status !== "DRAFT" && p.status !== "APPROVED") return contactIdForProject(db, projectId);
    await db.proposal.update({ where: { id: proposalId }, data: { status: "DRAFT", approvedAt: null } });
    await setProposalTask(db, projectId, PREPARE_TASK, false);
    return contactIdForProject(db, projectId);
  });
  revalidateBoth(projectId, contactId);
}

export interface ProposalSendInfo {
  error?: string;
  subject?: string;
  html?: string;
  to?: string | null;
  attachment?: { filename: string; mimeType: string; base64: string };
}

// What the "Send to client" email should say: subject, a body (the cover letter, an
// invitation to book a call, how to pay the 1st instalment) with the proposal PDF
// attached, and the recipient. Refuses an unapproved proposal.
export async function proposalSendInfo(proposalId: string, projectId: string): Promise<ProposalSendInfo> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return withScopedPrismaClient(async (db) => {
    const proposal = await db.proposal.findUnique({
      where: { id: proposalId },
      include: { project: { include: { contact: true } }, paymentSchedule: { orderBy: { order: "asc" } } },
    });
    if (!proposal || proposal.projectId !== projectId) return { error: "Proposal not found." };
    if (!proposal.approvedAt) return { error: "Approve the proposal before sending it." };
    if (proposal.status !== "DRAFT" && proposal.status !== "APPROVED") return { error: "This proposal has already been sent." };

    const pdfData = await loadProposalPdfData(db, projectId, proposalId);
    if (!pdfData) return { error: "Couldn't build the proposal PDF." };
    const pdf = await buildProposalPdf(pdfData.data);

    const settings = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
    const c = proposal.project.contact;
    const fr = (c.locale ?? "").toLowerCase().startsWith("fr");
    const first = c.firstName || "";
    const grand = proposal.subtotal + proposal.taxAmount;
    const firstRow = proposal.paymentSchedule[0];
    const firstAmount = firstRow ? firstRow.amount ?? (firstRow.percentage != null ? Math.round((firstRow.percentage / 100) * grand * 100) / 100 : null) : null;
    const money = (n: number) => new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: proposal.currency }).format(n);

    const subject = fr ? `Soumission — ${proposal.project.name}` : `Proposal — ${proposal.project.name}`;
    const letter = (proposal.coverLetter ?? "").trim();
    const letterHtml = letter
      ? letter.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("")
      : `<p>${fr ? `Bonjour ${esc(first)},` : `Hi ${esc(first)},`}</p><p>${fr ? `Vous trouverez ci-joint la soumission pour <strong>${esc(proposal.project.name)}</strong>.` : `Please find attached the proposal for <strong>${esc(proposal.project.name)}</strong>.`}</p>`;

    const callHtml = fr
      ? `<p>Je serais heureux de passer la soumission en revue avec vous et de répondre à vos questions. ${settings.bookingUrl ? `Vous pouvez réserver un appel au moment qui vous convient ici : <a href="${esc(settings.bookingUrl)}">réserver un appel</a>.` : "Répondez simplement à ce courriel pour fixer un moment."}</p>`
      : `<p>I'd be happy to walk you through the proposal and answer any questions. ${settings.bookingUrl ? `You can book a call at a time that suits you here: <a href="${esc(settings.bookingUrl)}">book a call</a>.` : "Just reply to this email to set up a time."}</p>`;

    const methods: string[] = [];
    if (settings.interacEmail) methods.push(fr ? `Virement Interac à <strong>${esc(settings.interacEmail)}</strong>` : `Interac e-Transfer to <strong>${esc(settings.interacEmail)}</strong>`);
    if (settings.cardPaymentUrl) methods.push(fr ? `Carte de crédit : <a href="${esc(settings.cardPaymentUrl)}">payer en ligne</a>` : `Credit card: <a href="${esc(settings.cardPaymentUrl)}">pay online</a>`);
    const payHtml =
      methods.length > 0
        ? fr
          ? `<p><strong>Pour démarrer — 1er versement${firstAmount != null ? ` : ${money(firstAmount)}` : ""}</strong><br>Vous pouvez payer par :</p><ul>${methods.map((m) => `<li>${m}</li>`).join("")}</ul><p>Dès la réception du paiement, la facture vous sera envoyée automatiquement.</p>`
          : `<p><strong>To get started — 1st instalment${firstAmount != null ? `: ${money(firstAmount)}` : ""}</strong><br>You can pay by:</p><ul>${methods.map((m) => `<li>${m}</li>`).join("")}</ul><p>Once the payment is received, your invoice will be sent to you automatically.</p>`
        : "";

    return {
      subject,
      html: letterHtml + callHtml + payHtml,
      to: c.billingEmail || c.email || c.email2 || c.extraEmails[0] || null,
      attachment: { filename: pdfData.fileName, mimeType: "application/pdf", base64: toBase64(pdf) },
    };
  });
}

// The copy signed and returned by the client (base64 from the browser, 4 MB max).
export async function attachSignedProposal(proposalId: string, projectId: string, base64: string, fileName: string, mime: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.length === 0) return { error: "Empty file." };
  if (bytes.length > 4_000_000) return { error: "The file is over 4 MB." };
  const contactId = await withScopedPrismaClient(async (db) => {
    await db.proposal.update({
      where: { id: proposalId },
      data: { signedFileName: fileName.slice(0, 200), signedFileMime: mime || "application/octet-stream", signedFileData: bytes as never, signedAt: new Date() },
    });
    return contactIdForProject(db, projectId);
  });
  revalidateBoth(projectId, contactId);
  return {};
}

export async function removeSignedProposal(proposalId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const contactId = await withScopedPrismaClient(async (db) => {
    await db.proposal.update({ where: { id: proposalId }, data: { signedFileName: null, signedFileMime: null, signedFileData: null as never, signedAt: null } });
    return contactIdForProject(db, projectId);
  });
  revalidateBoth(projectId, contactId);
}

// After the email went out: the proposal is now with the client.
export async function markProposalSent(proposalId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const contactId = await withScopedPrismaClient(async (db) => {
    await db.proposal.update({ where: { id: proposalId }, data: { status: "SENT", sentAt: new Date() } });
    await setProposalTask(db, projectId, PREPARE_TASK, true);
    await setProposalTask(db, projectId, SEND_TASK, true);
    return contactIdForProject(db, projectId);
  });
  revalidateBoth(projectId, contactId);
}
