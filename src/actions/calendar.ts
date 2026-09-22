"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import {
  getValidAccessToken,
  createCalendarEvent as gCreateEvent,
  updateCalendarEvent as gUpdateEvent,
  deleteCalendarEvent as gDeleteEvent,
  getCalendarEvent as gGetEvent,
  type CalendarEventInput,
  type CalendarEventDetail,
} from "@/lib/google";

export interface EventLinkTargets {
  contactId: string;
  projectId: string;
  taskId: string;
  bookingId: string;
}

async function saveLinks(db: PrismaClient, googleEventId: string, links: EventLinkTargets) {
  const contactId = links.contactId || null;
  const projectId = links.projectId || null;
  const taskId = links.taskId || null;
  const bookingId = links.bookingId || null;

  if (!contactId && !projectId && !taskId && !bookingId) {
    await db.calendarEventLink.deleteMany({ where: { googleEventId } });
  } else {
    await db.calendarEventLink.upsert({
      where: { googleEventId },
      update: { contactId, projectId, taskId, bookingId },
      create: { googleEventId, contactId, projectId, taskId, bookingId },
    });
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
