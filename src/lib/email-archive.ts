import type { PrismaClient } from "@/lib/prisma";
import { parseMessage } from "@/lib/mail/mime-parse";
import { buildMimeMessage } from "@/lib/mail/mime-build";
import { fetchGmailMessageRaw, getValidAccessToken } from "@/lib/google";
import { fetchImapMessageRaw } from "@/lib/mail/imap";
import { getIonosMailbox } from "@/lib/mail/ionos";

// Saved copies of emails (see EmailArchive in the schema). Raw messages are stored base64-encoded: a raw MIME message
// can hold bytes Postgres text cannot, and base64 keeps it safe at about a third more space.
const MAX_RAW = 10 * 1024 * 1024;
const MAX_THREAD_MESSAGES = 25;

const toB64 = (binary: string) => btoa(binary);
export const fromB64 = (b64: string) => atob(b64);

export async function archiveRaw(
  db: PrismaClient,
  input: { source: string; messageKey: string; threadKey?: string | null; raw: string; reason: "linked" | "done"; userId: string | null }
): Promise<void> {
  const parsed = parseMessage(input.raw);
  let raw = input.raw;
  let truncated = false;
  if (raw.length > MAX_RAW) {
    // Too big to keep with its attachments: keep a text/HTML-only rebuild instead.
    raw = buildMimeMessage({
      fromName: parsed.from.name || null,
      fromEmail: parsed.from.email || "unknown@invalid",
      to: parsed.to.map((a) => a.email),
      cc: parsed.cc.map((a) => a.email),
      bcc: [],
      subject: parsed.subject,
      html: parsed.html ?? `<pre>${(parsed.text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`,
      includeBccHeader: false,
    }).raw;
    truncated = true;
  }
  const data = {
    threadKey: input.threadKey ?? undefined,
    subject: parsed.subject || null,
    fromLabel: parsed.from.name ? `${parsed.from.name} <${parsed.from.email}>` : parsed.from.email || null,
    messageDate: parsed.date ? new Date(parsed.date) : null,
    rawBase64: toB64(raw),
    truncated,
    reason: input.reason,
    archivedById: input.userId,
  };
  await db.emailArchive.upsert({
    where: { source_messageKey: { source: input.source, messageKey: input.messageKey } },
    update: data,
    create: { source: input.source, messageKey: input.messageKey, ...data },
  });
}

/** Saves a linked thread: every Gmail message in it (up to 25), or the one IONOS message. Never throws. */
export async function archiveLinkedThread(db: PrismaClient, userId: string, threadKey: string, reason: "linked" | "done" = "linked"): Promise<void> {
  try {
    if (threadKey.startsWith("ionos:")) {
      const uid = Number(threadKey.slice(6));
      const box = await getIonosMailbox(userId, db);
      if (!box || !Number.isFinite(uid)) return;
      const raw = await fetchImapMessageRaw(
        { host: box.credentials.imapHost, port: box.credentials.imapPort, security: box.credentials.imapSecurity, username: box.credentials.username, password: box.credentials.password },
        uid
      );
      if (raw) await archiveRaw(db, { source: `ionos:${userId}`, messageKey: threadKey, threadKey, raw, reason, userId });
      return;
    }
    const token = await getValidAccessToken(userId, db);
    if (!token) return;
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadKey}?format=minimal`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      // The key may be a message id rather than a thread id (the green-check "Done" passes one).
      const single = await fetchGmailMessageRaw(token, threadKey);
      if (single) await archiveRaw(db, { source: `gmail:${userId}`, messageKey: threadKey, threadKey, raw: single.raw, reason, userId });
      return;
    }
    const ids = (((await res.json()) as { messages?: { id: string }[] }).messages ?? []).map((m) => m.id).slice(-MAX_THREAD_MESSAGES);
    for (const id of ids) {
      const msg = await fetchGmailMessageRaw(token, id);
      if (msg) await archiveRaw(db, { source: `gmail:${userId}`, messageKey: id, threadKey, raw: msg.raw, reason, userId });
    }
  } catch {
    // Archiving is a safety copy: a failure must never break linking.
  }
}

/** The newest saved message for a thread key or message key, as a raw message. */
export async function findArchivedRaw(db: PrismaClient, key: string): Promise<{ raw: string; threadKey: string | null } | null> {
  const row =
    (await db.emailArchive.findFirst({ where: { threadKey: key }, orderBy: { messageDate: "desc" } })) ??
    (await db.emailArchive.findFirst({ where: { messageKey: key }, orderBy: { archivedAt: "desc" } }));
  if (!row) return null;
  try {
    return { raw: fromB64(row.rawBase64), threadKey: row.threadKey };
  } catch {
    return null;
  }
}
