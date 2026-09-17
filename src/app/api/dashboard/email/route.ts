import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken, getRecentEmails } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getEmailClassifications } from "@/lib/email-classifier";
import { getReadStates } from "@/lib/email-inbox";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" as const };

    const emails = await getRecentEmails(accessToken);
    if (emails === null) return { error: "fetch_failed" as const };

    // Anything opened from the CRM (here or on the Email page) drops out
    // of this "needs attention" preview immediately, regardless of
    // Gmail's own read flag (which the CRM has no write access to).
    const readStates = await getReadStates(
      db,
      emails.map((e) => e.id)
    );
    const unread = emails.filter((e) => !readStates[e.id]);
    // Cache-aware — classifying here costs a Claude call only for
    // messages neither this card nor the Email page has screened before.
    const classifications = await getEmailClassifications(db, unread);
    return { emails: unread, classifications };
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json(result);
}
