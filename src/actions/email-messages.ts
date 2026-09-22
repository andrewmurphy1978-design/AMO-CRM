"use server";

import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getGoogleConnection, fetchGmailMessageRaw, sendGmailMessage } from "@/lib/google";
import { parseMessage, type AttachmentMeta } from "@/lib/mail/mime-parse";
import { buildMimeMessage } from "@/lib/mail/mime-build";
import { resolveReplyIdentity, type MailIdentity } from "@/lib/mail/identity";
import { getIonosMailbox, recordIonosResult } from "@/lib/mail/ionos";
import { sendViaSmtp } from "@/lib/mail/smtp";

export interface EmailDetail {
  id: string;
  threadId: string;
  subject: string;
  from: { name: string; email: string };
  to: string[];
  cc: string[];
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: AttachmentMeta[];
  messageIdHeader: string | null;
  references: string[];
  replyIdentity: MailIdentity;
}

// Every mail identity this user currently has, in preference order — Gmail
// first (the primary account), then a connected IONOS mailbox if any.
// resolveReplyIdentity picks between them based on the original message's
// own headers, not this order — this order only matters as the last-
// resort fallback when nothing else matches.
async function loadIdentities(userId: string, db: PrismaClient): Promise<MailIdentity[]> {
  const [google, ionos] = await Promise.all([getGoogleConnection(userId, db), getIonosMailbox(userId, db)]);
  const identities: MailIdentity[] = [];
  if (google?.email) identities.push({ source: "gmail", accountAddress: google.email, displayName: null });
  if (ionos) identities.push({ source: "ionos", accountAddress: ionos.address, displayName: ionos.displayName });
  return identities;
}

// The Email Dialog's "open a message" call — fetches the full RFC 5322
// body (see fetchGmailMessageRaw's comment in google.ts for why this is a
// separate, more expensive call from the list view) and parses it with
// the shared MIME parser, same one IMAP's fetch will use once that source
// exists.
export async function fetchEmailDetail(id: string): Promise<EmailDetail | { error: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };

    const [fetched, identities] = await Promise.all([fetchGmailMessageRaw(accessToken, id), loadIdentities(session.user.id, db)]);
    if (!fetched) return { error: "not_found" };

    const parsed = parseMessage(fetched.raw);
    const replyIdentity = resolveReplyIdentity(
      { to: parsed.to.map((a) => a.email), cc: parsed.cc.map((a) => a.email), deliveredTo: parsed.deliveredTo },
      "gmail",
      identities
    );

    return {
      id,
      threadId: fetched.threadId,
      subject: parsed.subject,
      from: parsed.from,
      to: parsed.to.map((a) => a.email),
      cc: parsed.cc.map((a) => a.email),
      date: parsed.date,
      html: parsed.html,
      text: parsed.text,
      attachments: parsed.attachments,
      messageIdHeader: parsed.messageId,
      references: parsed.references,
      replyIdentity,
    };
  });
}

export interface SendEmailInput {
  inReplyToId: string | null; // the Gmail message id being replied to/forwarded (for threading) — null for a message with no original
  threadId: string | null;
  messageIdHeader: string | null; // its Message-ID header, for In-Reply-To
  references: string[];
  to: string[];
  cc: string[];
  subject: string;
  html: string;
}

// Sends a reply/forward composed in the Email Dialog. The From address is
// never taken from the client — it's recomputed here from the original
// message's own headers via resolveReplyIdentity, the same rule
// fetchEmailDetail used to show it in the first place, so a stale or
// tampered client value can't send from the wrong address.
export async function sendEmailAction(input: SendEmailInput): Promise<{ error: string } | { success: true }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };

    const identities = await loadIdentities(session.user.id, db);
    if (identities.length === 0) return { error: "not_connected" };

    // Re-derive the reply identity from the original message rather than
    // trusting anything the client sent about it.
    let replyIdentity = identities[0];
    if (input.inReplyToId) {
      const fetched = await fetchGmailMessageRaw(accessToken, input.inReplyToId);
      if (fetched) {
        const original = parseMessage(fetched.raw);
        replyIdentity = resolveReplyIdentity(
          { to: original.to.map((a) => a.email), cc: original.cc.map((a) => a.email), deliveredTo: original.deliveredTo },
          "gmail",
          identities
        );
      }
    }

    if (input.to.length === 0) return { error: "recipient_required" };

    const { raw } = buildMimeMessage({
      fromName: replyIdentity.displayName,
      fromEmail: replyIdentity.accountAddress,
      to: input.to,
      cc: input.cc,
      bcc: [],
      subject: input.subject,
      html: input.html,
      inReplyTo: input.messageIdHeader,
      references: input.references,
    });

    if (replyIdentity.source === "ionos") {
      const mailbox = await getIonosMailbox(session.user.id, db);
      if (!mailbox) return { error: "not_connected" };
      try {
        await sendViaSmtp(
          {
            host: mailbox.credentials.smtpHost,
            port: mailbox.credentials.smtpPort,
            security: mailbox.credentials.smtpSecurity,
            username: mailbox.credentials.username,
            password: mailbox.credentials.password,
          },
          { from: replyIdentity.accountAddress, to: input.to, cc: input.cc, bcc: [], raw }
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await recordIonosResult(session.user.id, db, message);
        return { error: message };
      }
      await recordIonosResult(session.user.id, db, null);
      // The sent copy isn't filed into the mailbox's own Sent folder yet —
      // that needs IMAP APPEND, which joins this once Phase 4's native
      // IMAP client exists.
      return { success: true };
    }

    const result = await sendGmailMessage(accessToken, raw, input.threadId ?? undefined);
    if ("error" in result) return { error: result.error };
    return { success: true };
  });
}
