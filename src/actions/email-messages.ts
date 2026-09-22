"use server";

import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getGoogleConnection, fetchGmailMessageRaw, sendGmailMessage } from "@/lib/google";
import { parseMessage, type AttachmentMeta } from "@/lib/mail/mime-parse";
import { buildMimeMessage } from "@/lib/mail/mime-build";
import { resolveReplyIdentity, type MailIdentity } from "@/lib/mail/identity";

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

// Every mail identity this user currently has, in preference order — just
// Gmail for now; a connected IONOS mailbox joins this list in a later
// phase, and resolveReplyIdentity already knows how to choose between
// several.
async function loadIdentities(userId: string, db: PrismaClient): Promise<MailIdentity[]> {
  const google = await getGoogleConnection(userId, db);
  if (!google?.email) return [];
  return [{ source: "gmail", accountAddress: google.email, displayName: null }];
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

    // Only the "gmail" source exists today — an "ionos" branch (native
    // SMTP) joins this switch in a later phase.
    const result = await sendGmailMessage(accessToken, raw, input.threadId ?? undefined);
    if ("error" in result) return { error: result.error };
    return { success: true };
  });
}
