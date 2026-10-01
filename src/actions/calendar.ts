"use server";

import { promoteContact } from "@/lib/project-progress";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import {
  getValidAccessToken,
  createCalendarEvent as gCreateEvent,
  updateCalendarEvent as gUpdateEvent,
  deleteCalendarEvent as gDeleteEvent,
  getCalendarEvent as gGetEvent,
  getPrimaryCalendarDefaultReminders,
  type CalendarEventInput,
  type CalendarEventDetail,
} from "@/lib/google";

export interface EventLinkTargets {
  contactId: string;
  projectId: string;
  taskId: string;
  bookingId: string;
  // Optional so dialogs that don't know about phases don't have to send it;
  // when absent, an existing phase is kept (see saveLinks).
  phaseId?: string;
}

async function saveLinks(db: PrismaClient, googleEventId: string, links: EventLinkTargets) {
  const contactId = links.contactId || null;
  const projectId = links.projectId || null;
  const taskId = links.taskId || null;
  const bookingId = links.bookingId || null;

  if (!contactId && !projectId && !taskId && !bookingId) {
    await db.calendarEventLink.deleteMany({ where: { googleEventId } });
  } else {
    // A phase belongs to the linked project: cleared with it, kept when an
    // older dialog saves without saying anything about phases.
    const existing = await db.calendarEventLink.findUnique({ where: { googleEventId }, select: { projectId: true, phaseId: true } });
    const phaseId =
      links.phaseId !== undefined
        ? projectId
          ? links.phaseId || null
          : null
        : existing && existing.projectId === projectId
          ? existing.phaseId
          : null;
    await db.calendarEventLink.upsert({
      where: { googleEventId },
      update: { contactId, projectId, phaseId, taskId, bookingId },
      create: { googleEventId, contactId, projectId, phaseId, taskId, bookingId },
    });
    // A Lead with an event scheduled (a discovery call, say) is now a Prospect.
    const owner = contactId ?? (projectId ? (await db.project.findUnique({ where: { id: projectId }, select: { contactId: true } }))?.contactId : null);
    await promoteContact(db, owner, "PROSPECT");
  }
}

export async function fetchCalendarEventDetail(eventId: string): Promise<CalendarEventDetail | { error: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };
    const detail = await gGetEvent(accessToken, eventId, session.user.name ?? null);
    if (!detail) return { error: "not_found" };
    return detail;
  });
}

// Used by both the view and edit dialogs to show what "Default
// notification" actually means (the calendar's own reminders list) instead
// of just that label — independent of any one event, so it's fetched on
// its own rather than folded into fetchCalendarEventDetail.
export async function fetchDefaultReminders(): Promise<{ minutes: number[] } | { error: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };
    return { minutes: await getPrimaryCalendarDefaultReminders(accessToken) };
  });
}

export async function createCalendarEventAction(
  values: CalendarEventInput,
  links: EventLinkTargets
): Promise<{ id?: string; error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "Google Calendar isn't connected." };

    const created = await gCreateEvent(accessToken, values);
    if ("error" in created) return created;

    await saveLinks(db, created.id, links);
    return { id: created.id };
  });

  revalidatePath("/calendar-app");
  revalidatePath("/");
  return result;
}

export async function updateCalendarEventAction(
  eventId: string,
  values: CalendarEventInput,
  links: EventLinkTargets
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "Google Calendar isn't connected." };

    const updated = await gUpdateEvent(accessToken, eventId, values);
    if (updated.error) return updated;

    await saveLinks(db, eventId, links);
    return {};
  });

  revalidatePath("/calendar-app");
  revalidatePath("/");
  return result;
}

export async function deleteCalendarEventAction(eventId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "Google Calendar isn't connected." };

    const deleted = await gDeleteEvent(accessToken, eventId);
    if (deleted.error) return deleted;

    await db.calendarEventLink.deleteMany({ where: { googleEventId: eventId } });
    return {};
  });

  revalidatePath("/calendar-app");
  revalidatePath("/");
  return result;
}
