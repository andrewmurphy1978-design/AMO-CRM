import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { markEmailRead } from "@/lib/email-inbox";
import { getIonosMailbox } from "@/lib/mail/ionos";
import { setImapSeenFlag } from "@/lib/mail/imap";

// Fired (fire-and-forget) whenever the user opens a message from the
// Email page or the Dashboard's email card — purely an in-CRM marker
// (see the comment on EmailReadState), not a Gmail write. For an
// "ionos:<uid>" id this also sets the real \Seen flag on the mailbox, so
// a native mail app or webmail session checking it agrees with the CRM —
// best-effort: a failed IMAP round trip never blocks the CRM's own state.
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
    await markEmailRead(db, id);
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
          true
        ).catch(() => {});
      }
    }
  });
  return NextResponse.json({ ok: true });
}
