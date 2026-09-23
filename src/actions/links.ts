"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// Both Gmail threads and Google Calendar events live outside our database —
// these actions just point a stable external id (thread id / event id) at
// a client/project/task(/booking) row here. An empty selection deletes the
// link row rather than storing an all-null one.

export async function saveEmailLink(
  gmailThreadId: string,
  target: { contactId?: string; projectId?: string; taskId?: string; affiliateProgramId?: string },
  // A snapshot taken at link time — Gmail threads aren't otherwise
  // queryable from a Contact/Project/Task page without knowing which team
  // member's account owns them (EmailLink has no userId), so this is what
  // lets those pages show something readable without a live Gmail call.
  meta?: { subject?: string; fromLabel?: string; date?: string; link?: string; myAddress?: string | null }
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  const contactId = target.contactId || null;
  const projectId = target.projectId || null;
  const taskId = target.taskId || null;
  const affiliateProgramId = target.affiliateProgramId || null;

  await withScopedPrismaClient(async (db) => {
    if (!contactId && !projectId && !taskId && !affiliateProgramId) {
      await db.emailLink.deleteMany({ where: { gmailThreadId } });
    } else {
      const snapshot = {
        subject: meta?.subject,
        fromLabel: meta?.fromLabel,
        messageDate: meta?.date ? new Date(meta.date) : undefined,
        gmailLink: meta?.link,
        myAddress: meta?.myAddress ?? undefined,
      };
      await db.emailLink.upsert({
        where: { gmailThreadId },
        update: { contactId, projectId, taskId, affiliateProgramId, ...snapshot },
        create: { gmailThreadId, contactId, projectId, taskId, affiliateProgramId, ...snapshot },
      });
    }
  });

  // Deliberately no revalidatePath("/email") — the Email page is a client
  // component that already patches its own state the instant a link save
  // resolves (see applyLinkSave in email-screening-view.tsx), and while the
  // dialog stays open, revalidating the current route would make Next
  // auto-refetch /email's Server Component (several sequential Prisma
  // reads) at the same moment the dialog may fire its own fetchEmailDetail
  // call for the next message — two concurrent Prisma-backed requests
  // racing on one Hyperdrive connection, which is exactly what trips
  // Cloudflare's Error 1102 (same lesson documented throughout this file's
  // sibling actions). /contacts and /marketing aren't the active route
  // when this runs, so revalidating them carries none of that risk.
  revalidatePath("/contacts");
  revalidatePath("/marketing");
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

  await withScopedPrismaClient(async (db) => {
    if (!contactId && !projectId && !taskId && !bookingId) {
      await db.calendarEventLink.deleteMany({ where: { googleEventId } });
    } else {
      await db.calendarEventLink.upsert({
        where: { googleEventId },
        update: { contactId, projectId, taskId, bookingId },
        create: { googleEventId, contactId, projectId, taskId, bookingId },
      });
    }
  });

  revalidatePath("/calendar-app");
}
