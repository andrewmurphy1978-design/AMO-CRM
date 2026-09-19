import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getWatchedPeople, isPersonalSectionUser, refreshPersonalInboxCache, bucketPersonalInbox } from "@/lib/personal-watch";

// The only route that actually spends a Gmail call for the Personal page —
// hit on the very first visit (no cache row yet), an explicit Refresh, or
// once the cached snapshot goes stale. A normal reopen inside that window
// reads the cache straight from the DB instead (see personal/page.tsx).
export async function POST() {
  const session = await auth();
  if (!session || !isPersonalSectionUser(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" as const };

    const people = await getWatchedPeople(db);
    const addresses = people.flatMap((p) => p.emails.map((e) => e.email));
    const snapshot = await refreshPersonalInboxCache(db, session.user.id, accessToken, addresses);
    const buckets = bucketPersonalInbox(people, snapshot);
    return { ...buckets, fetchedAt: snapshot.fetchedAt };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
