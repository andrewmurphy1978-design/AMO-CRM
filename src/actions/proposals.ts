"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { computeBillingTotals, contactTaxLocation, type LineItemInput } from "@/lib/billing-totals";
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
    return contactIdForProject(db, projectId);
  });

  revalidateBoth(projectId, contactId);
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

function readLineItems(formData: FormData): (LineItemInput & { description: string })[] {
  const descriptions = formData.getAll("lineItemDescription").map(String);
  const quantities = formData.getAll("lineItemQuantity").map(String);
  const unitPrices = formData.getAll("lineItemUnitPrice").map(String);
  const items: { description: string; quantity: number; unitPrice: number }[] = [];
  for (let i = 0; i < descriptions.length; i++) {
    const description = descriptions[i].trim();
    const unitPrice = Number(unitPrices[i]);
    if (!description || Number.isNaN(unitPrice)) continue;
    const quantity = Number(quantities[i]);
    items.push({ description, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, unitPrice });
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

  await withScopedPrismaClient(async (db) => {
    const existing = await db.proposal.findUniqueOrThrow({ where: { id: proposalId } });
    const { project, totals } = await computeProposalTotals(db, data.projectId, lineItems);

    await db.proposal.update({
      where: { id: proposalId },
      data: {
        title: data.title,
        status: data.status,
        currency: data.currency,
        coverLetter: data.coverLetter,
        notes: data.notes,
        subtotal: totals.subtotal,
        gstAmount: totals.gst,
        qstAmount: totals.qst,
        hstAmount: totals.hst,
        taxAmount: totals.total,
        totalAmount: totals.totalAmount,
        amount: totals.totalAmount,
        sentAt: data.status === "SENT" && existing.status !== "SENT" ? new Date() : existing.sentAt,
        respondedAt:
          (data.status === "ACCEPTED" || data.status === "DECLINED") && existing.status !== data.status
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

    revalidateBoth(data.projectId, project.contactId);
  });

  revalidatePath(`/projects/${data.projectId}/proposals/${proposalId}`);
  return { success: t.actions.proposalUpdated };
}

// Called directly from the client form (not a <form action>) — a plain
// async function, not FormData-shaped, since it just returns a draft for
// the form to pre-fill rather than persisting anything.
export async function draftProposalAI(projectId: string, brief: string): Promise<AIProposalDraft | { error: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { contact: true } });
    const servicesCatalog = await db.servicePriceListItem.findMany({ where: { active: true }, orderBy: { name: "asc" } });
    const clientLabel =
      [project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") ||
      project.contact.company ||
      project.contact.email ||
      "";

    return draftProposalWithAI(db, {
      clientLabel,
      projectName: project.name,
      currency: "CAD",
      servicesCatalog,
      brief,
    });
  });
}
