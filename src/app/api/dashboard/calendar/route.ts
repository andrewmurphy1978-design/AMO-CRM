import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken, getUpcomingEvents } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getResolvedEventLinks } from "@/lib/calendar-links";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // One shared client for both DB reads below (the token lookup and the
  // link lookup, with the Google fetch happening in between) — same
  // reasoning as /api/calendar/events.
  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" as const };

    const events = await getUpcomingEvents(accessToken);
    if (events === null) return { error: "fetch_failed" as const };

    const links = events.length > 0 ? await getResolvedEventLinks(db, events.map((e) => e.id)) : {};
    return { events, links };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
