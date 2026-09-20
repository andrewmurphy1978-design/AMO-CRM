"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Both Gmail threads and Google Calendar events live outside our database —
// these actions just point a stable external id (thread id / event id) at
// a client/project/task(/booking) row here. An empty selection deletes the
// link row rather than storing an all-null one.

export async function saveEmailLink(
  gmailThreadId: string,
  target: { contactId?: string; projectId?: string; taskId?: string },
  // A snapshot taken at link time — Gmail threads aren't otherwise
  // queryable from a Contact/Project/Task page without knowing which team
  // member's account owns them (EmailLink has no userId), so this is what
  // lets those pages show something readable without a live Gmail call.
  meta?: { subject?: string; fromLabel?: string; date?: string; link?: string }
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const contactId = target.contactId || null;
  const projectId = target.projectId || null;
  const taskId = target.taskId || null;

  if (!contactId && !projectId && !taskId) {
    await prisma.emailLink.deleteMany({ where: { gmailThreadId } });
  } else {
    const snapshot = {
      subject: meta?.subject,
      fromLabel: meta?.fromLabel,
      messageDate: meta?.date ? new Date(meta.date) : undefined,
      gmailLink: meta?.link,
    };
    await prisma.emailLink.upsert({
      where: { gmailThreadId },
      update: { contactId, projectId, taskId, ...snapshot },
      create: { gmailThreadId, contactId, projectId, taskId, ...snapshot },
    });
  }

  revalidatePath("/email");
  revalidatePath("/contacts");
}

export async function saveCalendarEventLink(
  googleEventId: string,
  target: { contactId?: string; projectId?: string; taskId?: string; bookingId?: string }
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const contactId = target.contactId || null;
  const projectId = target.projectId || null;
  const taskId = target.taskId || null;
  const bookingId = target.bookingId || null;

  if (!contactId && !projectId && !taskId && !bookingId) {
    await prisma.calendarEventLink.deleteMany({ where: { googleEventId } });
  } else {
    await prisma.calendarEventLink.upsert({
      where: { googleEventId },
      update: { contactId, projectId, taskId, bookingId },
      create: { googleEventId, contactId, projectId, taskId, bookingId },
    });
  }

  revalidatePath("/calendar-app");
}
