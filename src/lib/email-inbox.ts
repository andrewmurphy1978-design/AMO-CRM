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
  completions: Record<string, string>;
}

// A thread already linked (by hand, or by a previous auto-link) is never
// second-guessed — this only fills in threads nobody has linked yet, by
// matching the other party's address against an existing Contact. Runs
// against whichever address list ("from" for received, "to" for sent) the
// caller passes; case-insensitive since header casing is not reliable.
interface AutoLinkCandidate {
  threadId: string;
  email: string;
  subject: string;
  fromLabel: string;
  date: string;
  link: string;
}

async function autoLinkToContacts(db: PrismaClient, candidates: AutoLinkCandidate[]): Promise<void> {
  if (candidates.length === 0) return;

  const threadIds = [...new Set(candidates.map((c) => c.threadId))];
  const existing = await db.emailLink.findMany({
    where: { gmailThreadId: { in: threadIds } },
    select: { gmailThreadId: true },
  });
  const alreadyLinked = new Set(existing.map((l) => l.gmailThreadId));
  const unlinked = candidates.filter((c) => !alreadyLinked.has(c.threadId));
  if (unlinked.length === 0) return;

  // A contact can have several email addresses (email, email2, and any
  // number of extraEmails) — every one of them should match an incoming/
  // outgoing thread, not just the primary. Prisma's `mode: "insensitive"`
  // isn't supported on array-contains filters, so `extraEmails` is matched
  // in JS below instead of in the query.
  const addresses = [...new Set(unlinked.map((c) => c.email.toLowerCase()))];
  const contacts = await db.contact.findMany({
    where: {
      OR: [
        { email: { in: addresses, mode: "insensitive" } },
        { email2: { in: addresses, mode: "insensitive" } },
        { extraEmails: { isEmpty: false } },
      ],
    },
    select: { id: true, email: true, email2: true, extraEmails: true },
  });
  if (contacts.length === 0) return;
  const addressSet = new Set(addresses);
  const contactByEmail = new Map<string, string>();
  for (const c of contacts) {
    for (const addr of [c.email, c.email2, ...c.extraEmails]) {
      if (!addr) continue;
      const normalized = addr.toLowerCase();
      if (addressSet.has(normalized) && !contactByEmail.has(normalized)) {
        contactByEmail.set(normalized, c.id);
      }
    }
  }

  // One thread might appear twice in `unlinked` (e.g. several sent
  // messages before a reply) — dedupe so each thread is only upserted once.
  const toLink = new Map<string, { contactId: string; candidate: AutoLinkCandidate }>();
  for (const c of unlinked) {
    const contactId = contactByEmail.get(c.email.toLowerCase());
    if (contactId && !toLink.has(c.threadId)) toLink.set(c.threadId, { contactId, candidate: c });
  }

  for (const [gmailThreadId, { contactId, candidate }] of toLink) {
    await db.emailLink.upsert({
      where: { gmailThreadId },
      // Fills in contactId if the row didn't exist yet, or was just created
      // a moment ago by the concurrent autoLinkToAffiliatePrograms call
      // below for the same thread (a genuine "this company is both a
      // contact and a program" case) — never touches any other field.
      update: { contactId },
      create: {
        gmailThreadId,
        contactId,
        subject: candidate.subject,
        fromLabel: candidate.fromLabel,
        messageDate: new Date(candidate.date),
        gmailLink: candidate.link,
      },
    });
  }
}

// Same "never second-guess an existing link" rule as autoLinkToContacts,
// but matched on the *domain* of the program's own links (destinationLink/
// brandedLink/frenchLink/frenchSlug) rather than fuzzy name matching — a
// domain a program actually owns is a much safer signal to auto-link on
// with zero human review than a substring match on the program's name
// would be (which is why the one-time historical backfill used a stricter,
// human-reviewed process instead of this).
function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function autoLinkToAffiliatePrograms(db: PrismaClient, candidates: AutoLinkCandidate[]): Promise<void> {
  if (candidates.length === 0) return;

  const threadIds = [...new Set(candidates.map((c) => c.threadId))];
  const existing = await db.emailLink.findMany({
    where: { gmailThreadId: { in: threadIds } },
    select: { gmailThreadId: true },
  });
  const alreadyLinked = new Set(existing.map((l) => l.gmailThreadId));
  const unlinked = candidates.filter((c) => !alreadyLinked.has(c.threadId));
  if (unlinked.length === 0) return;

  const programs = await db.affiliateProgram.findMany({
    select: { id: true, brandedLink: true, destinationLink: true, frenchSlug: true, frenchLink: true },
  });
  if (programs.length === 0) return;

  // A domain owned by more than one program can't be attributed safely —
  // dropped from the map entirely rather than guessed.
  const domainToProgram = new Map<string, string | null>();
  for (const p of programs) {
    for (const host of [hostnameOf(p.brandedLink), hostnameOf(p.destinationLink), hostnameOf(p.frenchSlug), hostnameOf(p.frenchLink)]) {
      if (!host) continue;
      domainToProgram.set(host, domainToProgram.has(host) && domainToProgram.get(host) !== p.id ? null : p.id);
    }
  }

  const toLink = new Map<string, { programId: string; candidate: AutoLinkCandidate }>();
  for (const c of unlinked) {
    const domain = c.email.split("@")[1]?.toLowerCase();
    const programId = domain ? domainToProgram.get(domain) : null;
    if (programId && !toLink.has(c.threadId)) toLink.set(c.threadId, { programId, candidate: c });
  }
  if (toLink.size === 0) return;

  for (const [gmailThreadId, { programId, candidate }] of toLink) {
    await db.emailLink.upsert({
      where: { gmailThreadId },
      // See the matching comment in autoLinkToContacts — fills in
      // affiliateProgramId even if the concurrent autoLinkToContacts call
      // just created this same row a moment ago for the same thread.
      update: { affiliateProgramId: programId },
      create: {
        gmailThreadId,
        affiliateProgramId: programId,
        subject: candidate.subject,
        fromLabel: candidate.fromLabel,
        messageDate: new Date(candidate.date),
        gmailLink: candidate.link,
      },
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

// The "mark as unread" action on a Recently Read row — deletes the read
// marker so the message reappears in its original category.
export async function markEmailUnread(db: PrismaClient, gmailMessageId: string): Promise<void> {
  await db.emailReadState.deleteMany({ where: { gmailMessageId } });
}

export async function getCompletions(db: PrismaClient, gmailMessageIds: string[]): Promise<Record<string, string>> {
  if (gmailMessageIds.length === 0) return {};
  const rows = await db.emailCompletion.findMany({ where: { gmailMessageId: { in: gmailMessageIds } } });
  const result: Record<string, string> = {};
  for (const r of rows) result[r.gmailMessageId] = r.completedAt.toISOString();
  return result;
}

// The green-check "mark as done" action on an Email page row — moves a
// received email to the Completed section regardless of its AI category.
export async function markEmailCompleted(db: PrismaClient, gmailMessageId: string): Promise<void> {
  await db.emailCompletion.upsert({ where: { gmailMessageId }, update: {}, create: { gmailMessageId } });
}

// The Completed section's own check button toggles back off — the message
// returns to whichever category/section it was in before being completed
// (recomputed fresh from its classification/read-state, not remembered).
export async function markEmailUncompleted(db: PrismaClient, gmailMessageId: string): Promise<void> {
  await db.emailCompletion.deleteMany({ where: { gmailMessageId } });
}

export interface EmailLinkInfo {
  contactId: string;
  projectId: string;
  taskId: string;
  affiliateProgramId: string;
  contactName: string;
  projectName: string;
  taskName: string;
  affiliateProgramName: string;
}

function contactLabel(c: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email;
}

export async function getEmailLinksByThread(db: PrismaClient, threadIds: string[]): Promise<Record<string, EmailLinkInfo>> {
  if (threadIds.length === 0) return {};
  const links = await db.emailLink.findMany({
    where: { gmailThreadId: { in: threadIds } },
    include: { contact: true, project: true, task: true, affiliateProgram: true },
  });
  const result: Record<string, EmailLinkInfo> = {};
  for (const link of links) {
    result[link.gmailThreadId] = {
      contactId: link.contactId ?? "",
      projectId: link.projectId ?? "",
      taskId: link.taskId ?? "",
      affiliateProgramId: link.affiliateProgramId ?? "",
      contactName: link.contact ? contactLabel(link.contact) : "",
      projectName: link.project?.name ?? "",
      taskName: link.task?.title ?? "",
      affiliateProgramName: link.affiliateProgram?.name ?? "",
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
  completions: Record<string, string>;
}> {
  const allThreadIds = [...new Set([...snapshot.emails.map((e) => e.threadId), ...snapshot.sentAwaitingReply.map((s) => s.threadId)])];
  const [classifications, readStates, linksByThread, completions] = await Promise.all([
    getEmailClassifications(db, snapshot.emails, userId),
    getReadStates(
      db,
      snapshot.emails.map((e) => e.id)
    ),
    getEmailLinksByThread(db, allThreadIds),
    getCompletions(
      db,
      snapshot.emails.map((e) => e.id)
    ),
  ]);
  return { classifications, readStates, linksByThread, completions };
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
  // Kept modest on purpose: Cloudflare Workers cap the number of outgoing
  // subrequests a single invocation can make, and each of these costs one
  // request per message/thread on top of the initial list call — see
  // getSentAwaitingReplies in src/lib/google.ts for the incident this
  // limit caused.
  const [emails, sentAwaitingReply] = await Promise.all([
    getRecentEmails(accessToken, { maxResults: 20, unreadOnly: false }),
    getSentAwaitingReplies(accessToken, { maxResults: 15 }),
  ]);
  const emailList = emails ?? [];
  const sentList = sentAwaitingReply ?? [];

  const receivedCandidates = emailList.map((e) => ({
    threadId: e.threadId,
    email: e.fromEmail,
    subject: e.subject,
    fromLabel: e.from,
    date: e.date,
    link: e.link,
  }));
  const sentCandidates = sentList.map((s) => ({
    threadId: s.threadId,
    email: s.toEmail,
    subject: s.subject,
    fromLabel: s.to,
    date: s.date,
    link: s.link,
  }));

  await Promise.all([
    autoLinkToContacts(db, receivedCandidates),
    autoLinkToContacts(db, sentCandidates),
    autoLinkToAffiliatePrograms(db, receivedCandidates),
    autoLinkToAffiliatePrograms(db, sentCandidates),
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
