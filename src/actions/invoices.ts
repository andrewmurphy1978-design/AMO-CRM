"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma, withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { computeBillingTotals, contactTaxLocation, type LineItemInput } from "@/lib/billing-totals";

const InvoiceSchema = z.object({
  projectId: z.string().min(1),
  number: z.string().trim().optional(),
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELED"]),
  amount: z.string().trim().min(1, "Amount is required"),
  currency: z.string().trim().min(1),
  dueDate: z.string().optional(),
  notes: z.string().trim().optional(),
});

async function contactIdForProject(projectId: string): Promise<string> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { contactId: true } });
  return project.contactId;
}

function revalidateBoth(projectId: string, contactId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/contacts/${contactId}`);
}

export async function createInvoice(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = InvoiceSchema.parse({
      projectId: String(formData.get("projectId") ?? ""),
      number: String(formData.get("number") ?? "").trim() || undefined,
      status: String(formData.get("status") ?? "DRAFT"),
      amount: String(formData.get("amount") ?? "").trim(),
      currency: String(formData.get("currency") ?? "CAD").trim() || "CAD",
      dueDate: String(formData.get("dueDate") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const amount = Number(data.amount);
  if (Number.isNaN(amount)) return { error: t.actions.invalidInput };

  await prisma.invoice.create({
    data: {
      projectId: data.projectId,
      number: data.number,
      status: data.status,
      amount,
      subtotal: amount,
      totalAmount: amount,
      currency: data.currency,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      notes: data.notes,
      sentAt: data.status === "SENT" ? new Date() : null,
      paidAt: data.status === "PAID" ? new Date() : null,
    },
  });

  revalidateBoth(data.projectId, await contactIdForProject(data.projectId));
  return { success: t.actions.invoiceCreated };
}

export async function updateInvoiceStatus(invoiceId: string, projectId: string, status: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: status as "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELED",
      ...(status === "SENT" ? { sentAt: new Date() } : {}),
      ...(status === "PAID" ? { paidAt: new Date() } : {}),
    },
  });

  revalidateBoth(projectId, await contactIdForProject(projectId));
}

export async function deleteInvoice(invoiceId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const contactId = await contactIdForProject(projectId);
  await prisma.invoice.delete({ where: { id: invoiceId } });
  revalidateBoth(projectId, contactId);
}

// Builds an Invoice from an already-accepted Proposal — copies its line
// items and tax breakdown as a starting point (both then live
// independently; editing one never touches the other). Due date defaults
// to 30 days out since a Proposal's payment schedule dates don't map
// cleanly onto a single invoice due date.
export async function convertProposalToInvoice(proposalId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const invoice = await withScopedPrismaClient(async (db) => {
    const proposal = await db.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: { lineItems: { orderBy: { order: "asc" } } },
    });

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await db.invoice.create({
      data: {
        projectId,
        proposalId,
        status: "DRAFT",
        currency: proposal.currency,
        subtotal: proposal.subtotal,
        gstAmount: proposal.gstAmount,
        qstAmount: proposal.qstAmount,
        hstAmount: proposal.hstAmount,
        taxAmount: proposal.taxAmount,
        totalAmount: proposal.totalAmount,
        amount: proposal.totalAmount,
        dueDate,
      },
    });

    if (proposal.lineItems.length > 0) {
      await db.invoiceLineItem.createMany({
        data: proposal.lineItems.map((li) => ({
          invoiceId: invoice.id,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          order: li.order,
        })),
      });
    }

    return invoice;
  });

  revalidateBoth(projectId, await contactIdForProject(projectId));
  redirect(`/projects/${projectId}/invoices/${invoice.id}`);
}

// Called after the "Send reminder now" button opens the mailto: draft —
// just records that a reminder went out, so the reminders list stops
// flagging this invoice for another REMINDER_INTERVAL_DAYS.
export async function markInvoiceReminderSent(invoiceId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { lastReminderAt: new Date(), reminderCount: { increment: 1 } },
  });

  revalidatePath("/invoices");
}

// --- Full invoice line-item editor (for invoices not created from a Proposal) ---

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

const InvoiceLineItemsSchema = z.object({
  number: z.string().trim().optional(),
  currency: z.enum(["CAD", "USD", "EUR", "GBP"]),
  dueDate: z.string().optional(),
  notes: z.string().trim().optional(),
});

export async function updateInvoiceLineItems(
  invoiceId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = InvoiceLineItemsSchema.parse({
      number: String(formData.get("number") ?? "").trim() || undefined,
      currency: String(formData.get("currency") ?? "CAD"),
      dueDate: String(formData.get("dueDate") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const lineItems = readLineItems(formData);

  const projectId = await withScopedPrismaClient(async (db) => {
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { project: { include: { contact: true } } } });
    const billingSettings = await db.billingSettings.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const totals = computeBillingTotals(lineItems, contactTaxLocation(invoice.project.contact), billingSettings.chargeCanadianTax);

    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        number: data.number,
        currency: data.currency,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes,
        subtotal: totals.subtotal,
        gstAmount: totals.gst,
        qstAmount: totals.qst,
        hstAmount: totals.hst,
        taxAmount: totals.total,
        totalAmount: totals.totalAmount,
        amount: totals.totalAmount,
      },
    });

    await db.invoiceLineItem.deleteMany({ where: { invoiceId } });
    if (lineItems.length > 0) {
      await db.invoiceLineItem.createMany({
        data: lineItems.map((li, i) => ({ invoiceId, ...li, order: i })),
      });
    }

    revalidateBoth(invoice.projectId, invoice.project.contactId);
    return invoice.projectId;
  });

  revalidatePath(`/projects/${projectId}/invoices/${invoiceId}`);
  return { success: t.actions.invoiceUpdated };
}
