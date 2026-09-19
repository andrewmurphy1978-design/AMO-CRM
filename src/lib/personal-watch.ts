import type { PrismaClient } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { searchEmailsForAddresses, getUpcomingEvents, type EmailSummary, type CalendarEventSummary } from "@/lib/google";

// The only account allowed to see the Personal section (sidebar link,
// page, and its Settings card) — family emails/events have no business
// reason to be visible to any other team member.
export const PERSONAL_SECTION_EMAIL = "andrewmurphy1978@gmail.com";

export function isPersonalSectionUser(userEmail: string | null | undefined): boolean {
  return userEmail?.toLowerCase() === PERSONAL_SECTION_EMAIL;
}

export interface WatchedPerson {
  id: string;
  name: string;
  emails: { id: string; email: string }[];
}

export async function getWatchedPeople(db: PrismaClient): Promise<WatchedPerson[]> {
  const people = await db.personalWatchPerson.findMany({
    orderBy: { order: "asc" },
    include: { emails: { orderBy: { email: "asc" } } },
  });
  return people.map((p) => ({
    id: p.id,
    name: p.name,
    emails: p.emails.map((e) => ({ id: e.id, email: e.email })),
  }));
}

// Which watched person(s) a given address belongs to — case-insensitive.
// A shared family inbox forwarding to the same address for two people
// would legitimately match both, so this returns every match rather than
// the first.
export function matchPeopleByAddress(people: WatchedPerson[], address: string): WatchedPerson[] {
  const lower = address.toLowerCase();
  return people.filter((p) => p.emails.some((e) => e.email.toLowerCase() === lower));
}

// Same idea, but for a raw header string that can list several addresses
// (a message's To header) or a free-text blob to substring-match against
// (kept simple: exact address match only, case-insensitive).
export function matchPeopleByRawHeader(people: WatchedPerson[], raw: string): WatchedPerson[] {
  const lower = raw.toLowerCase();
  return people.filter((p) => p.emails.some((e) => lower.includes(e.email.toLowerCase())));
}

export interface PersonalInboxSnapshot {
  emails: EmailSummary[];
  events: CalendarEventSummary[];
  fetchedAt: string; // ISO
}

export async function getCachedPersonalInbox(db: PrismaClient, userId: string): Promise<PersonalInboxSnapshot | null> {
  const row = await db.personalInboxCache.findUnique({ where: { userId } });
  if (!row) return null;
  return {
    emails: row.emails as unknown as EmailSummary[],
    events: row.events as unknown as CalendarEventSummary[],
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

// The one place that actually spends a Gmail search + per-message fetch
// for the Personal page — called only on the very first visit (no cache
// row yet), an explicit Refresh, or once the cached snapshot goes stale
// (see src/lib/staleness.ts). A normal reopen inside that window reads
// getCachedPersonalInbox instead, same pattern as the Email page's
// EmailInboxCache.
export async function refreshPersonalInboxCache(
  db: PrismaClient,
  userId: string,
  accessToken: string,
  addresses: string[]
): Promise<PersonalInboxSnapshot> {
  const [emails, events] = await Promise.all([
    searchEmailsForAddresses(accessToken, addresses, { maxResults: 40 }),
    getUpcomingEvents(accessToken),
  ]);
  const emailList = emails ?? [];
  const eventList = events ?? [];
  const fetchedAt = new Date();
  const emailsJson = emailList as unknown as Prisma.InputJsonValue;
  const eventsJson = eventList as unknown as Prisma.InputJsonValue;
  await db.personalInboxCache.upsert({
    where: { userId },
    update: { emails: emailsJson, events: eventsJson, fetchedAt },
    create: { userId, emails: emailsJson, events: eventsJson, fetchedAt },
  });
  return { emails: emailList, events: eventList, fetchedAt: fetchedAt.toISOString() };
}

export interface PersonalInboxBuckets {
  emailsByPerson: Record<string, EmailSummary[]>;
  eventsByPerson: Record<string, CalendarEventSummary[]>;
}

// Sorts a flat email/event snapshot into per-person buckets — shared by
// the initial server render and the /api/personal/inbox refresh route, so
// the matching logic (and the addresses it depends on) never has to ship
// to the client.
export function bucketPersonalInbox(people: WatchedPerson[], snapshot: { emails: EmailSummary[]; events: CalendarEventSummary[] }): PersonalInboxBuckets {
  const emailsByPerson: Record<string, EmailSummary[]> = Object.fromEntries(people.map((p) => [p.id, []]));
  const eventsByPerson: Record<string, CalendarEventSummary[]> = Object.fromEntries(people.map((p) => [p.id, []]));

  for (const e of snapshot.emails) {
    const matched = new Set([...matchPeopleByAddress(people, e.fromEmail), ...matchPeopleByRawHeader(people, e.toRaw)]);
    for (const p of matched) emailsByPerson[p.id]?.push(e);
  }
  for (const ev of snapshot.events) {
    const matched = new Set(ev.attendeeEmails.flatMap((addr) => matchPeopleByAddress(people, addr)));
    for (const p of matched) eventsByPerson[p.id]?.push(ev);
  }

  return { emailsByPerson, eventsByPerson };
}
