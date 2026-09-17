import type { PrismaClient } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getRecentEmails, getSentAwaitingReplies, type EmailSummary, type SentEmailSummary } from "@/lib/google";
import { getEmailClassifications, type EmailCategory } from "@/lib/email-classifier";

export interface EmailInboxSnapshot {
  emails: EmailSummary[];
  sentAwaitingReply: SentEmailSummary[];
  fetchedAt: string; // ISO
}

// Everything the Email page's client view needs in one shape — returned
// by both the initial server render (from the cached snapshot) and the
// /api/email/inbox refresh endpoint, so the client treats them the same.
export interface EmailScreeningPayload extends EmailInboxSnapshot {
  classifications: Record<string, EmailCategory>;
  readStates: Record<string, string>;
  linksByThread: Record<string, EmailLinkInfo>;
}

// A thread already linked (by hand, or by a previous auto-link) is never
// second-guessed — this only fills in threads nobody has linked yet, by
// matching the other party's address against an existing Contact. Runs
// against whichever address list ("from" for received, "to" for sent) the
// caller passes; case-insensitive since header casing is not reliable.
async function autoLinkToContacts(db: PrismaClient, candidates: { threadId: string; email: string }[]): Promise<void> {
  if (candidates.length === 0) return;

  const threadIds = [...new Set(candidates.map((c) => c.threadId))];
  const existing = await db.emailLink.findMany({
    where: { gmailThreadId: { in: threadIds } },
    select: { gmailThreadId: true },
  });
  const alreadyLinked = new Set(existing.map((l) => l.gmailThreadId));
  const unlinked = candidates.filter((c) => !alreadyLinked.has(c.threadId));
  if (unlinked.length === 0) return;

  const addresses = [...new Set(unlinked.map((c) => c.email.toLowerCase()))];
  const contacts = await db.contact.findMany({
    where: { email: { in: addresses, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (contacts.length === 0) return;
  const contactByEmail = new Map(contacts.map((c) => [c.email.toLowerCase(), c.id]));

  // One thread might appear twice in `unlinked` (e.g. several sent
  // messages before a reply) — dedupe so each thread is only upserted once.
  const toLink = new Map<string, string>();
  for (const c of unlinked) {
    const contactId = contactByEmail.get(c.email.toLowerCase());
    if (contactId && !toLink.has(c.threadId)) toLink.set(c.threadId, contactId);
  }

  for (const [gmailThreadId, contactId] of toLink) {
    await db.emailLink.upsert({
      where: { gmailThreadId },
      update: {}, // never override a link that appeared since the check above
      create: { gmailThreadId, contactId },
    });
  }
}

export async function getReadStates(db: PrismaClient, gmailMessageIds: string[]): Promise<Record<string, string>> {
  if (gmailMessageIds.length === 0) return {};
  const rows = await db.emailReadState.findMany({ where: { gmailMessageId: { in: gmailMessageIds } } });
  const result: Record<string, string> = {};
  for (const r of rows) result[r.gmailMessageId] = r.readAt.toISOString();
  return result;
}

// Idempotent — an email keeps the timestamp of when it was FIRST opened,
// so the 7-day "recently read" window doesn't reset just because it was
// reopened.
export async function markEmailRead(db: PrismaClient, gmailMessageId: string): Promise<void> {
  await db.emailReadState.upsert({ where: { gmailMessageId }, update: {}, create: { gmailMessageId } });
}

export interface EmailLinkInfo {
  contactId: string;
  projectId: string;
  taskId: string;
  contactName: string;
  projectName: string;
  taskName: string;
}

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

export async function getEmailLinksByThread(db: PrismaClient, threadIds: string[]): Promise<Record<string, EmailLinkInfo>> {
  if (threadIds.length === 0) return {};
  const links = await db.emailLink.findMany({
    where: { gmailThreadId: { in: threadIds } },
    include: { contact: true, project: true, task: true },
  });
  const result: Record<string, EmailLinkInfo> = {};
  for (const link of links) {
    result[link.gmailThreadId] = {
      contactId: link.contactId ?? "",
      projectId: link.projectId ?? "",
      taskId: link.taskId ?? "",
      contactName: link.contact ? contactLabel(link.contact) : "",
      projectName: link.project?.name ?? "",
      taskName: link.task?.title ?? "",
    };
  }
  return result;
}

// Bundles the three lookups every screening view needs alongside the raw
// email/sent lists — one call, sharing whatever scoped client the caller
// already has open.
export async function getScreeningExtras(
  db: PrismaClient,
  snapshot: EmailInboxSnapshot,
  userId?: string
): Promise<{
  classifications: Record<string, EmailCategory>;
  readStates: Record<string, string>;
  linksByThread: Record<string, EmailLinkInfo>;
}> {
  const allThreadIds = [...new Set([...snapshot.emails.map((e) => e.threadId), ...snapshot.sentAwaitingReply.map((s) => s.threadId)])];
  const [classifications, readStates, linksByThread] = await Promise.all([
    getEmailClassifications(db, snapshot.emails, userId),
    getReadStates(
      db,
      snapshot.emails.map((e) => e.id)
    ),
    getEmailLinksByThread(db, allThreadIds),
  ]);
  return { classifications, readStates, linksByThread };
}

export async function getCachedInbox(db: PrismaClient, userId: string): Promise<EmailInboxSnapshot | null> {
  const row = await db.emailInboxCache.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    emails: row.emails as unknown as EmailSummary[],
    sentAwaitingReply: (row.sentAwaitingReply as unknown as SentEmailSummary[] | null) ?? [],
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

// The one place that actually spends Gmail + Claude calls: fetches a fresh
// inbox + sent-awaiting-reply list, auto-links anything matching a known
// Contact, classifies only genuinely new messages (EmailClassification is
// a permanent cache keyed by message id), and saves the snapshot so the
// next page load can skip straight to getCachedInbox. Called only on the
// very first visit (no cache row yet) or an explicit Refresh — never on a
// normal reopen.
export async function refreshEmailInboxCache(db: PrismaClient, userId: string, accessToken: string): Promise<EmailInboxSnapshot> {
  // Always re-checks the same fixed window (not just "since the last
  // refresh") — whether a sent thread is still awaiting a reply can only
  // be answered fresh each time (a reply might arrive between refreshes,
  // but so can a thread that's been waiting since before the previous
  // check), and this costs Gmail calls only, never a Claude credit, so
  // there's no real saving from narrowing it.
  const [emails, sentAwaitingReply] = await Promise.all([
    getRecentEmails(accessToken, { maxResults: 30, unreadOnly: false }),
    getSentAwaitingReplies(accessToken, { maxResults: 20 }),
  ]);
  const emailList = emails ?? [];
  const sentList = sentAwaitingReply ?? [];

  await Promise.all([
    autoLinkToContacts(
      db,
      emailList.map((e) => ({ threadId: e.threadId, email: e.fromEmail }))
    ),
    autoLinkToContacts(
      db,
      sentList.map((s) => ({ threadId: s.threadId, email: s.toEmail }))
    ),
  ]);

  // Cache-aware — only classifies messages EmailClassification hasn't
  // seen before, so a Refresh never re-spends a Claude call on an email
  // it already screened.
  await getEmailClassifications(db, emailList, userId);

  const fetchedAt = new Date();
  const emailsJson = emailList as unknown as Prisma.InputJsonValue;
  const sentJson = sentList as unknown as Prisma.InputJsonValue;
  await db.emailInboxCache.upsert({
    where: { userId },
    update: { emails: emailsJson, sentAwaitingReply: sentJson, fetchedAt },
    create: { userId, emails: emailsJson, sentAwaitingReply: sentJson, fetchedAt },
  });

  return { emails: emailList, sentAwaitingReply: sentList, fetchedAt: fetchedAt.toISOString() };
}

export type { EmailCategory };
