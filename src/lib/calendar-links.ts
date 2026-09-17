import type { PrismaClient } from "@/lib/prisma";
import { getCalendarEventsByIds, type CalendarEventSummary } from "@/lib/google";

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
