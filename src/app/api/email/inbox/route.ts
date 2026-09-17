import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { refreshEmailInboxCache, getScreeningExtras } from "@/lib/email-inbox";

// The only route that actually spends Gmail + Claude calls for the Email
// page — hit on the very first visit (no cache row yet) and whenever the
// user presses Refresh. A normal reopen never calls this; the page reads
// its last-fetched snapshot straight from the DB instead.
export async function POST() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" as const };

    const snapshot = await refreshEmailInboxCache(db, session.user.id, accessToken);
    const extras = await getScreeningExtras(db, snapshot);
    return { ...snapshot, ...extras };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
