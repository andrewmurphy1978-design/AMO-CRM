"use server";

import { promoteContact } from "@/lib/project-progress";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getTwilioConfig, publicBaseUrl, sendTwilioSms } from "@/lib/twilio";
import { explainTwilioError } from "@/lib/twilio-errors";
import { attachSmsNumberToContact } from "@/lib/sms-link";
import { summarizeInteractionWithAI } from "@/lib/interaction-ai";

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

  await withScopedPrismaClient(async (db) => {
    await db.interaction.create({
      data: {
        type: data.type,
        subject: data.subject,
        notes: data.notes,
        contactId: data.contactId,
        projectId: data.projectId,
        loggedById: session.user.id,
      },
    });
    // A logged call, meeting or text: a Lead is now a Prospect.
    if (["CALL", "MEETING", "SMS"].includes(data.type)) await promoteContact(db, data.contactId, "PROSPECT");
  });

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
  summary: z.string().trim().optional(),
  occurredAt: z.date(),
  durationMinutes: z.number().int().min(0).max(100000).nullable(),
  projectId: z.string().optional(),
  phaseId: z.string().optional(),
  taskId: z.string().optional(),
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
      summary: String(formData.get("summary") ?? "").trim() || undefined,
      occurredAt: isNaN(occurred.getTime()) ? new Date() : occurred,
      durationMinutes: String(formData.get("durationMinutes") ?? "").trim() === "" ? null : Math.round(Number(formData.get("durationMinutes"))),
      projectId: String(formData.get("projectId") ?? "").trim() || undefined,
      phaseId: String(formData.get("phaseId") ?? "").trim() || undefined,
      taskId: String(formData.get("taskId") ?? "").trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Invalid input" };
    }
    throw error;
  }
  // Only meaningful for an incoming text that has no contact yet.
  const linkContactId = String(formData.get("linkContactId") ?? "").trim();

  const participants = formData
    .getAll("participant")
    .map(String)
    .map((value) => {
      const [kind, id] = value.split(":");
      return id && (kind === "contact" || kind === "user") ? { kind, id } : null;
    })
    .filter((p): p is { kind: "contact" | "user"; id: string } => p !== null)
    .map((p) => (p.kind === "contact" ? { contactId: p.id } : { userId: p.id }));

  // "Send as text": a new SMS entry that is also actually sent through
  // Twilio. The message goes out first, so a failed send never leaves a
  // "sent" entry behind.
  const sendTo = formData.get("sendViaTwilio") === "on" && !interactionId && data.type === "SMS" ? String(formData.get("smsTo") ?? "").trim() : null;

  const sendError = await withScopedPrismaClient(async (db) => {
    let twilio: { sid: string; status: string } | null = null;
    if (sendTo) {
      if (!data.notes) return "Type the message to send.";
      const config = await getTwilioConfig(db);
      if (!config) return "Twilio isn't connected — add it in Settings first.";
      const base = publicBaseUrl();
      const result = await sendTwilioSms(config, sendTo, data.notes, base ? `${base}/api/twilio/status` : null);
      if ("error" in result) return explainTwilioError(result.code, session.user.language === "FR" ? "fr" : "en", result.error);
      twilio = result;
    }

    if (interactionId) {
      // A text that went through Twilio is a record of what was sent or
      // received: its type and message stay as they are whatever is posted.
      const current = await db.interaction.findUnique({ where: { id: interactionId }, select: { direction: true, type: true, notes: true, occurredAt: true, contactId: true, externalNumber: true } });
      // A text from a number matching no contact gets its contact here; that
      // also links its siblings from the same number.
      let linked = Boolean(current?.contactId);
      if (current && !current.contactId && linkContactId && current.externalNumber) {
        await attachSmsNumberToContact(db, current.externalNumber, linkContactId);
        linked = true;
      }
      const locked = Boolean(current?.direction);
      const isSms = (locked ? current?.type : data.type) === "SMS";
      await db.$transaction([
        db.interaction.update({
          where: { id: interactionId },
          data: {
            type: locked && current ? current.type : data.type,
            subject: isSms ? null : (data.subject ?? null),
            notes: locked && current ? current.notes : data.notes,
            summary: data.summary ?? null,
            occurredAt: locked && current ? current.occurredAt : data.occurredAt,
            durationMinutes: isSms ? null : data.durationMinutes,
            // Projects, phases and tasks belong to a contact: none until linked.
            projectId: linked ? (data.projectId ?? null) : null,
            phaseId: linked ? (data.phaseId ?? null) : null,
            taskId: linked ? (data.taskId ?? null) : null,
            updatedById: session.user.id,
          },
        }),
        // SMS entries have no participant picker, so an edit leaves theirs alone.
        ...(isSms ? [] : [db.interactionParticipant.deleteMany({ where: { interactionId } })]),
        ...(!isSms && participants.length > 0 ? [db.interactionParticipant.createMany({ data: participants.map((p) => ({ interactionId, ...p })) })] : []),
      ]);
    } else {
      await db.interaction.create({
        data: {
          type: data.type,
          subject: data.type === "SMS" ? undefined : data.subject,
          notes: data.notes,
          summary: data.summary,
          // A text sent from here goes out now; SMS has no duration.
          occurredAt: twilio ? new Date() : data.occurredAt,
          durationMinutes: data.type === "SMS" ? null : data.durationMinutes,
          contactId,
          projectId: data.projectId,
          phaseId: data.phaseId,
          taskId: data.taskId,
          loggedById: session.user.id,
          updatedById: session.user.id,
          // SMS has no participant picker: it's the contact, plus you when you sent it.
          participants: {
            create: data.type === "SMS" ? [{ contactId }, ...(twilio ? [{ userId: session.user.id }] : [])] : participants,
          },
          ...(twilio && sendTo
            ? { direction: "OUTBOUND", externalId: twilio.sid, externalNumber: sendTo, deliveryStatus: twilio.status }
            : {}),
        },
      });
      // A logged call, meeting or text: a Lead is now a Prospect.
      if (["CALL", "MEETING", "SMS"].includes(data.type)) await promoteContact(db, contactId, "PROSPECT");
    }
    return null;
  });
  if (sendError) return { error: sendError };

  if (contactId) revalidatePath(`/contacts/${contactId}`);
  if (linkContactId) revalidatePath(`/contacts/${linkContactId}`);
  revalidatePath("/sms");
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`);
  return { success: sendTo ? "Text sent." : "Saved." };
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

// "Generate a summary with AI": from the notes / pasted transcript currently in the dialog.
export async function generateInteractionSummary(notes: string, type: string, subject?: string): Promise<{ summary?: string; error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  if (!notes.trim()) return { error: "Paste or type the notes first." };
  const result = await withScopedPrismaClient((db) => summarizeInteractionWithAI(db, { notes, type, subject }));
  return "error" in result ? { error: result.error } : { summary: result.summary };
}
