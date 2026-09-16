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
  target: { contactId?: string; projectId?: string; taskId?: string }
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const contactId = target.contactId || null;
  const projectId = target.projectId || null;
  const taskId = target.taskId || null;

  if (!contactId && !projectId && !taskId) {
    await prisma.emailLink.deleteMany({ where: { gmailThreadId } });
  } else {
    await prisma.emailLink.upsert({
      where: { gmailThreadId },
      update: { contactId, projectId, taskId },
      create: { gmailThreadId, contactId, projectId, taskId },
    });
  }

  revalidatePath("/email");
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
