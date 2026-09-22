// Tracks messages sent from the IONOS mailbox via SMTP — Gmail's own
// "Sent — awaiting reply" section is derived live from Gmail's Sent
// folder/thread data (getSentAwaitingReplies in google.ts), but IONOS has
// no equivalent to query on demand, so each send is recorded in the
// SentEmailRecord table instead and reconciled against the mailbox's own
// recent inbox messages on every refresh.

import type { PrismaClient } from "@/lib/prisma";
import type { SentEmailSummary } from "@/lib/google";
import type { ImapMessageSummary } from "./imap";

export async function recordIonosSend(
  db: PrismaClient,
  userId: string,
  input: { messageId: string; to: string; toEmail: string; subject: string }
): Promise<void> {
  // A Message-ID is generated fresh per send (see buildMimeMessage), so
  // this should never collide — upsert only as a defensive fallback
  // against a retried send reusing the same id.
  await db.sentEmailRecord.upsert({
    where: { messageId: input.messageId },
    update: {},
    create: { userId, messageId: input.messageId, to: input.to, toEmail: input.toEmail, subject: input.subject },
  });
}

// Checks every still-"awaiting" sent record against this refresh's freshly
// fetched inbox messages' own In-Reply-To/References headers — a match
// means a reply has arrived, so the record flips to "completed" (kept,
// not deleted, so it can still show up under the Email page's Completed
// section, same as Gmail's own sent-thread handling).
export async function reconcileIonosSentRecords(db: PrismaClient, userId: string, messages: ImapMessageSummary[]): Promise<void> {
  const awaiting = await db.sentEmailRecord.findMany({ where: { userId, status: "awaiting" } });
  if (awaiting.length === 0) return;

  const repliedTo = new Set<string>();
  for (const m of messages) {
    if (m.inReplyTo) repliedTo.add(m.inReplyTo);
    for (const ref of m.references) repliedTo.add(ref);
  }

  const nowCompleted = awaiting.filter((r) => repliedTo.has(r.messageId));
  if (nowCompleted.length === 0) return;

  await db.sentEmailRecord.updateMany({
    where: { id: { in: nowCompleted.map((r) => r.id) } },
    data: { status: "completed" },
  });
}

// "ionos-sent:<id>" — distinct from a received message's "ionos:<uid>" so
// the two id spaces (and whatever they're keyed into, e.g. EmailLink)
// never collide.
export function ionosSentSummaryId(recordId: string): string {
  return `ionos-sent:${recordId}`;
}

export function parseIonosSentRecordId(id: string): string | null {
  return id.startsWith("ionos-sent:") ? id.slice("ionos-sent:".length) : null;
}

// Recent sent records (both statuses — the caller filters "awaiting" vs
// "completed" the same way Gmail's own sentAwaitingReply list is split),
// mapped into the same SentEmailSummary shape the rest of the Email page
// already works with.
export async function listIonosSentRecords(db: PrismaClient, userId: string, maxResults: number): Promise<SentEmailSummary[]> {
  const rows = await db.sentEmailRecord.findMany({
    where: { userId },
    orderBy: { sentAt: "desc" },
    take: maxResults,
  });
  return rows.map((r) => ({
    id: ionosSentSummaryId(r.id),
    threadId: ionosSentSummaryId(r.id),
    to: r.to,
    toEmail: r.toEmail,
    subject: r.subject,
    snippet: "",
    date: r.sentAt.toISOString(),
    link: "https://mail.ionos.com/",
    status: r.status as "awaiting" | "completed",
  }));
}
