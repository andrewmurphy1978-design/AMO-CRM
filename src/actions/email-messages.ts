"use server";

import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getGoogleConnection, fetchGmailMessageRaw, sendGmailMessage } from "@/lib/google";
import { parseMessage, type AttachmentMeta, type ParsedMessage } from "@/lib/mail/mime-parse";
import { buildMimeMessage } from "@/lib/mail/mime-build";
import { resolveReplyIdentity, type MailIdentity, type MailSource } from "@/lib/mail/identity";
import { getIonosMailbox, recordIonosResult, type IonosMailbox } from "@/lib/mail/ionos";
import { sendViaSmtp } from "@/lib/mail/smtp";
import { fetchImapMessageRaw } from "@/lib/mail/imap";
import { recordIonosSend, parseIonosSentRecordId } from "@/lib/mail/sent-records";

// "ionos:<uid>" ids (see EmailSummary's source/messageIdHeader comment in
// google.ts) never collide with a bare Gmail id, which is exactly what
// lets every id-keyed table (EmailClassification, EmailLink, etc.) accept
// either source without a schema change or backfill.
function parseIonosUid(id: string): number | null {
  if (!id.startsWith("ionos:")) return null;
  const uid = Number(id.slice("ionos:".length));
  return Number.isFinite(uid) ? uid : null;
}

// Fetches and parses one message's full raw body, from whichever source
// its id names — same ParsedMessage shape either way, since Gmail's
// format=raw and IMAP's BODY.PEEK[] are both fed into the same
// mime-parse.ts parser (see that file's header comment).
async function fetchOriginal(
  id: string,
  accessToken: string,
  mailbox: IonosMailbox | null
): Promise<{ parsed: ParsedMessage; threadId: string; source: MailSource } | null> {
  const uid = parseIonosUid(id);
  if (uid !== null) {
    if (!mailbox) return null;
    const raw = await fetchImapMessageRaw(
      {
        host: mailbox.credentials.imapHost,
        port: mailbox.credentials.imapPort,
        security: mailbox.credentials.imapSecurity,
        username: mailbox.credentials.username,
        password: mailbox.credentials.password,
      },
      uid
    );
    if (!raw) return null;
    return { parsed: parseMessage(raw), threadId: id, source: "ionos" };
  }
  const fetched = await fetchGmailMessageRaw(accessToken, id);
  if (!fetched) return null;
  return { parsed: parseMessage(fetched.raw), threadId: fetched.threadId, source: "gmail" };
}

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
// the shared MIME parser, whichever source the id names (see
// fetchOriginal above).
export async function fetchEmailDetail(id: string): Promise<EmailDetail | { error: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    // An "ionos-sent:<id>" record has no raw message stored anywhere (SMTP
    // doesn't file a Sent-folder copy the way Gmail's send API does — see
    // sendEmailAction's ionos branch) — it's the CRM's own local record of
    // a send, so the dialog shows what that record has rather than
    // fetching a body that was never kept.
    const sentRecordId = parseIonosSentRecordId(id);
    if (sentRecordId !== null) {
      const record = await db.sentEmailRecord.findUnique({ where: { id: sentRecordId } });
      if (!record || record.userId !== session.user.id) return { error: "not_found" };
      const mailbox = await getIonosMailbox(session.user.id, db);
      return {
        id,
        threadId: id,
        subject: record.subject,
        from: { name: mailbox?.displayName ?? "", email: mailbox?.address ?? "" },
        to: [record.toEmail],
        cc: [],
        date: record.sentAt.toISOString(),
        html: null,
        text: null,
        attachments: [],
        messageIdHeader: record.messageId,
        references: [],
        replyIdentity: { source: "ionos", accountAddress: mailbox?.address ?? "", displayName: mailbox?.displayName ?? null },
      };
    }

    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };

    const [mailbox, identities] = await Promise.all([getIonosMailbox(session.user.id, db), loadIdentities(session.user.id, db)]);
    const original = await fetchOriginal(id, accessToken, mailbox);
    if (!original) return { error: "not_found" };

    const { parsed, threadId, source } = original;
    const replyIdentity = resolveReplyIdentity(
      { to: parsed.to.map((a) => a.email), cc: parsed.cc.map((a) => a.email), deliveredTo: parsed.deliveredTo },
      source,
      identities
    );

    return {
      id,
      threadId,
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

    const [mailbox, identities] = await Promise.all([getIonosMailbox(session.user.id, db), loadIdentities(session.user.id, db)]);
    if (identities.length === 0) return { error: "not_connected" };

    // Re-derive the reply identity from the original message rather than
    // trusting anything the client sent about it.
    let replyIdentity = identities[0];
    if (input.inReplyToId) {
      const original = await fetchOriginal(input.inReplyToId, accessToken, mailbox);
      if (original) {
        replyIdentity = resolveReplyIdentity(
          { to: original.parsed.to.map((a) => a.email), cc: original.parsed.cc.map((a) => a.email), deliveredTo: original.parsed.deliveredTo },
          original.source,
          identities
        );
      }
    }

    if (input.to.length === 0) return { error: "recipient_required" };

    const { raw, messageId } = buildMimeMessage({
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
      // A reply to an existing thread doesn't need its own "awaiting
      // reply" row — a fresh message (no inReplyToId) is the only case
      // that starts a new thread worth tracking that way.
      if (!input.inReplyToId) {
        await recordIonosSend(db, session.user.id, { messageId, to: input.to[0], toEmail: input.to[0], subject: input.subject });
      }
      // The sent copy isn't filed into the mailbox's own Sent folder yet —
      // that needs IMAP APPEND, which is further Phase 5 polish beyond
      // this pass, not core to sending or its "awaiting reply" tracking.
      return { success: true };
    }

    const result = await sendGmailMessage(accessToken, raw, input.threadId ?? undefined);
    if ("error" in result) return { error: result.error };
    return { success: true };
  });
}
