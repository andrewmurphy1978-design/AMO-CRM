"use server";

import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken, fetchGmailMessageRaw } from "@/lib/google";
import { parseMessage, type AttachmentMeta } from "@/lib/mail/mime-parse";

export interface EmailDetail {
  id: string;
  subject: string;
  from: { name: string; email: string };
  to: string[];
  cc: string[];
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: AttachmentMeta[];
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

    const raw = await fetchGmailMessageRaw(accessToken, id);
    if (!raw) return { error: "not_found" };

    const parsed = parseMessage(raw);
    return {
      id,
      subject: parsed.subject,
      from: parsed.from,
      to: parsed.to.map((a) => a.email),
      cc: parsed.cc.map((a) => a.email),
      date: parsed.date,
      html: parsed.html,
      text: parsed.text,
      attachments: parsed.attachments,
    };
  });
}
