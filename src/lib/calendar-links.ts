import type { PrismaClient } from "@/lib/prisma";
import { getCalendarEventsByIds, type CalendarEventSummary } from "@/lib/google";

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

export interface ResolvedEventLink {
  contactId: string;
  contactName: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskName: string;
}

// Resolves each event's link to display-ready names in one query, rather
// than shipping the client full contacts/projects/tasks lists just to look
// three names up — used by the Dashboard's calendar card, which (unlike
// the full Calendar page) has no editing UI of its own for these links.
export async function getResolvedEventLinks(db: PrismaClient, eventIds: string[]): Promise<Record<string, ResolvedEventLink>> {
  if (eventIds.length === 0) return {};
  const links = await db.calendarEventLink.findMany({
    where: { googleEventId: { in: eventIds } },
    include: { contact: true, project: true, task: true },
  });
  const result: Record<string, ResolvedEventLink> = {};
  for (const link of links) {
    result[link.googleEventId] = {
      contactId: link.contactId ?? "",
      contactName: link.contact ? contactLabel(link.contact) : "",
      projectId: link.projectId ?? "",
      projectName: link.project?.name ?? "",
      taskId: link.taskId ?? "",
      taskName: link.task?.title ?? "",
    };
  }
  return result;
}

// Looks up which Google events are linked to this contact/project (via
// CalendarEventLink) and fetches their current details from Google —
// returns [] rather than throwing when Google isn't connected, so the
// Calendar card on Contact/Project detail pages can render an empty state
// instead of failing the whole page.
export async function getLinkedCalendarEvents(
  db: PrismaClient,
  where: { contactId: string } | { projectId: string },
  accessToken: string | null
): Promise<CalendarEventSummary[]> {
  if (!accessToken) return [];
  const links = await db.calendarEventLink.findMany({ where, select: { googleEventId: true } });
  if (links.length === 0) return [];
  const events = await getCalendarEventsByIds(accessToken, links.map((l) => l.googleEventId));
  return events.sort((a, b) => {
    const aTime = a.start ? new Date(a.start).getTime() : 0;
    const bTime = b.start ? new Date(b.start).getTime() : 0;
    return aTime - bTime;
  });
}
