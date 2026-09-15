"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

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
      currency: data.currency,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      notes: data.notes,
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
