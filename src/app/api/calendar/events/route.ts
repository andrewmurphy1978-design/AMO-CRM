import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken, getCalendarEventsInRange } from "@/lib/google";
import { prisma } from "@/lib/prisma";

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

  const accessToken = await getValidAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 502 });
  }

  const events = await getCalendarEventsInRange(accessToken, start, end);
  if (events === null) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }

  const eventIds = events.map((e) => e.id);
  const links =
    eventIds.length > 0
      ? await prisma.calendarEventLink.findMany({ where: { googleEventId: { in: eventIds } } })
      : [];
  const linksByEvent = Object.fromEntries(
    links.map((l) => [
      l.googleEventId,
      { contactId: l.contactId ?? "", projectId: l.projectId ?? "", taskId: l.taskId ?? "", bookingId: l.bookingId ?? "" },
    ])
  );

  return NextResponse.json({ events, links: linksByEvent });
}
