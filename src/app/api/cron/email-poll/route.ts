import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { refreshEmailInboxCache } from "@/lib/email-inbox";

// Keeps every user's Email page cache warm between page opens — without
// this, new IONOS mail (and new Gmail mail) only shows up once someone
// actually opens /email and its own "stale after 15 minutes" check kicks
// in (see email-screening-view.tsx). The GitHub Actions workflow pings
// this route every 15 minutes, same cadence as that staleness check, so a
// page open is never more than one interval behind either.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const results = await withScopedPrismaClient(async (db) => {
    // Only Google-connected users get polled — a Gmail connection is what
    // every existing refresh path (page load, manual Refresh) already
    // requires before it will touch IONOS at all (see fetchEmailDetail/
    // sendEmailAction's "not_connected" guards), so a user with no Google
    // account has nothing here to keep warm yet.
    const accounts = await db.googleAccount.findMany({ select: { userId: true } });
    const outcomes: { userId: string; ok: boolean; error?: string }[] = [];
    for (const { userId } of accounts) {
      try {
        const accessToken = await getValidAccessToken(userId, db);
        if (!accessToken) {
          outcomes.push({ userId, ok: false, error: "no_access_token" });
          continue;
        }
        await refreshEmailInboxCache(db, userId, accessToken);
        outcomes.push({ userId, ok: true });
      } catch (e) {
        // One user's bad IMAP password or a transient Gmail hiccup should
        // never stop the rest of the team's mailboxes from refreshing.
        outcomes.push({ userId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return outcomes;
  });

  return NextResponse.json({ ok: true, polled: results.length, results });
}
