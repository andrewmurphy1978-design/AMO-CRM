import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { markEmailUnread } from "@/lib/email-inbox";
import { getIonosMailbox } from "@/lib/mail/ionos";
import { setImapSeenFlag } from "@/lib/mail/imap";

// The Recently Read section's own "mark as unread" action — undoes an open
// that dropped the message out of its category, moving it back there. For
// an "ionos:<uid>" id this also clears the real \Seen flag on the
// mailbox — best-effort: a failed IMAP round trip never blocks the CRM's
// own state.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await withScopedPrismaClient(async (db) => {
    await markEmailUnread(db, id);
    const uid = id.startsWith("ionos:") ? Number(id.slice("ionos:".length)) : null;
    if (uid !== null && Number.isFinite(uid)) {
      const mailbox = await getIonosMailbox(session.user.id, db);
      if (mailbox) {
        await setImapSeenFlag(
          {
            host: mailbox.credentials.imapHost,
            port: mailbox.credentials.imapPort,
            security: mailbox.credentials.imapSecurity,
            username: mailbox.credentials.username,
            password: mailbox.credentials.password,
          },
          uid,
          false
        ).catch(() => {});
      }
    }
  });
  return NextResponse.json({ ok: true });
}
