import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { getCachedInbox, refreshEmailInboxCache } from "@/lib/email-inbox";
import { getUpcomingEvents } from "@/lib/google";
import { notifyCalendar, notifyNewContacts, notifyNewEmails } from "@/lib/push-triggers";
import { prunePushLog } from "@/lib/push";
import { syncAllGoogleTasks } from "@/lib/google-tasks";
import { sendDailyBriefings } from "@/lib/daily-briefing";

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
        const before = await getCachedInbox(db, userId).catch(() => null);
        const after = await refreshEmailInboxCache(db, userId, accessToken);
        outcomes.push({ userId, ok: true });
        // Push notifications: new emails, then upcoming calendar events (Discovery calls included).
        await notifyNewEmails(db, userId, before?.emails ?? null, after.emails).catch(() => undefined);
        const events = await getUpcomingEvents(accessToken).catch(() => null);
        if (events) await notifyCalendar(db, userId, events).catch(() => undefined);
      } catch (e) {
        // One user's bad IMAP password or a transient Gmail hiccup should
        // never stop the rest of the team's mailboxes from refreshing.
        outcomes.push({ userId, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    // New contacts (any source) and housekeeping of the notification log.
    await notifyNewContacts(db).catch(() => undefined);
    await prunePushLog(db);
    // The morning Daily Briefing: a no-op until 7:00 and once it's gone out today (inboxes were just refreshed above).
    await sendDailyBriefings(db).catch(() => 0);
    return outcomes;
  });

  // Same 15-minute tick also picks up tasks changed in Google Tasks (on a
  // phone, say) for everyone who has task sync turned on.
  await syncAllGoogleTasks().catch(() => undefined);

  return NextResponse.json({ ok: true, polled: results.length, results });
}
