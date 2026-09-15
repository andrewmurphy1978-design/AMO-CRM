"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const InteractionSchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE"]),
  subject: z.string().trim().optional(),
  notes: z.string().trim().min(1, "Notes are required"),
  contactId: z.string().min(1),
  projectId: z.string().optional(),
});

export async function logInteraction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  let data;
  try {
    data = InteractionSchema.parse({
      type: String(formData.get("type") ?? "NOTE"),
      subject: String(formData.get("subject") ?? "").trim() || undefined,
      notes: String(formData.get("notes") ?? "").trim(),
      contactId: String(formData.get("contactId") ?? ""),
      projectId: String(formData.get("projectId") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Invalid input" };
    }
    throw error;
  }

  await prisma.interaction.create({
    data: {
      type: data.type,
      subject: data.subject,
      notes: data.notes,
      contactId: data.contactId,
      projectId: data.projectId,
      loggedById: session.user.id,
    },
  });

  revalidatePath(`/contacts/${data.contactId}`);
  if (data.projectId) {
    revalidatePath(`/projects/${data.projectId}`);
  }

  return { success: "Logged." };
}

export async function deleteInteraction(
  interactionId: string,
  contactId: string,
  projectId?: string | null
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await prisma.interaction.delete({ where: { id: interactionId } });

  revalidatePath(`/contacts/${contactId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}
