import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken, getCalendarEventsInRange } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";

// Backs the multi-view Calendar page's client-side navigation (switching
// views, paging to a different week/month/day) — each of those needs a
// different date range than the Dashboard's fixed "today + 12 days"
// window, so this takes start/end explicitly instead of hardcoding one.
// Also returns each event's CalendarEventLink (if any) keyed by event id,
// so the client doesn't need a second round-trip to know what's already
// linked once it navigates to a new range.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "start and end query params are required" }, { status: 400 });
  }

  // One shared client for both DB reads below (the token lookup and the
  // link lookup, with the Google fetch happening in between) — this route
  // is hit on every view switch and every Prev/Next click while browsing
  // the Calendar, and the plain `prisma` proxy opens a brand-new
  // connection on every property access; two of those landing in quick
  // succession on every navigation is exactly what was driving repeated
  // Cloudflare Error 1102s while using the Calendar (same root cause
  // already fixed for the Google OAuth callback route and this page's own
  // initial server-rendered load).
  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" as const };

    const events = await getCalendarEventsInRange(accessToken, start, end);
    if (events === null) return { error: "fetch_failed" as const };

    const eventIds = events.map((e) => e.id);
    const links =
      eventIds.length > 0 ? await db.calendarEventLink.findMany({ where: { googleEventId: { in: eventIds } } }) : [];
    const linksByEvent = Object.fromEntries(
      links.map((l) => [
        l.googleEventId,
        { contactId: l.contactId ?? "", projectId: l.projectId ?? "", taskId: l.taskId ?? "", bookingId: l.bookingId ?? "" },
      ])
    );
    return { events, links: linksByEvent };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
