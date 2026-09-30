"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

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

  await withScopedPrismaClient((db) =>
    db.interaction.create({
      data: {
        type: data.type,
        subject: data.subject,
        notes: data.notes,
        contactId: data.contactId,
        projectId: data.projectId,
        loggedById: session.user.id,
      },
    })
  );

  revalidatePath(`/contacts/${data.contactId}`);
  if (data.projectId) {
    revalidatePath(`/projects/${data.projectId}`);
  }

  return { success: "Logged." };
}

const ContactInteractionSchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "SMS"]),
  subject: z.string().trim().optional(),
  notes: z.string().trim(),
  occurredAt: z.date(),
  projectId: z.string().optional(),
});

// The Calls & SMS card's Add/Edit dialog. `interactionId` null = a new
// entry (created by the current user); otherwise the existing one is
// updated and its last-modified user/time are stamped. Participants are
// replaced wholesale from the submitted "participant" values, each
// "contact:<id>" (the contact itself or a related contact) or
// "user:<id>" (a team member).
export async function saveContactInteraction(
  contactId: string,
  interactionId: string | null,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  let data;
  try {
    const occurred = new Date(String(formData.get("occurredAt") ?? ""));
    data = ContactInteractionSchema.parse({
      type: String(formData.get("type") ?? "CALL"),
      subject: String(formData.get("subject") ?? "").trim() || undefined,
      notes: String(formData.get("notes") ?? "").trim(),
      occurredAt: isNaN(occurred.getTime()) ? new Date() : occurred,
      projectId: String(formData.get("projectId") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Invalid input" };
    }
    throw error;
  }

  const participants = formData
    .getAll("participant")
    .map(String)
    .map((value) => {
      const [kind, id] = value.split(":");
      return id && (kind === "contact" || kind === "user") ? { kind, id } : null;
    })
    .filter((p): p is { kind: "contact" | "user"; id: string } => p !== null)
    .map((p) => (p.kind === "contact" ? { contactId: p.id } : { userId: p.id }));

  await withScopedPrismaClient(async (db) => {
    if (interactionId) {
      await db.$transaction([
        db.interaction.update({
          where: { id: interactionId },
          data: {
            type: data.type,
            subject: data.subject ?? null,
            notes: data.notes,
            occurredAt: data.occurredAt,
            projectId: data.projectId ?? null,
            updatedById: session.user.id,
          },
        }),
        db.interactionParticipant.deleteMany({ where: { interactionId } }),
        ...(participants.length > 0 ? [db.interactionParticipant.createMany({ data: participants.map((p) => ({ interactionId, ...p })) })] : []),
      ]);
    } else {
      await db.interaction.create({
        data: {
          type: data.type,
          subject: data.subject,
          notes: data.notes,
          occurredAt: data.occurredAt,
          contactId,
          projectId: data.projectId,
          loggedById: session.user.id,
          updatedById: session.user.id,
          participants: { create: participants },
        },
      });
    }
  });

  revalidatePath(`/contacts/${contactId}`);
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`);
  return { success: "Saved." };
}

export async function deleteInteraction(
  interactionId: string,
  contactId: string,
  projectId?: string | null
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) => db.interaction.delete({ where: { id: interactionId } }));

  revalidatePath(`/contacts/${contactId}`);
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}
