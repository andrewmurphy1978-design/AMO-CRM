"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const ProposalSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Title is required"),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]),
  amount: z.string().trim().optional(),
  currency: z.string().trim().min(1),
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

  await prisma.proposal.create({
    data: {
      projectId: data.projectId,
      title: data.title,
      status: data.status,
      amount: data.amount ? Number(data.amount) : null,
      currency: data.currency,
      notes: data.notes,
      sentAt: data.status === "SENT" ? new Date() : null,
    },
  });

  revalidateBoth(data.projectId, await contactIdForProject(data.projectId));
  return { success: t.actions.proposalCreated };
}

export async function updateProposalStatus(proposalId: string, projectId: string, status: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const now = new Date();
  await prisma.proposal.update({
    where: { id: proposalId },
    data: {
      status: status as "DRAFT" | "SENT" | "ACCEPTED" | "DECLINED",
      ...(status === "SENT" ? { sentAt: now } : {}),
      ...(status === "ACCEPTED" || status === "DECLINED" ? { respondedAt: now } : {}),
    },
  });

  revalidateBoth(projectId, await contactIdForProject(projectId));
}

export async function deleteProposal(proposalId: string, projectId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const contactId = await contactIdForProject(projectId);
  await prisma.proposal.delete({ where: { id: proposalId } });
  revalidateBoth(projectId, contactId);
}
