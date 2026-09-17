import type { PrismaClient } from "@/lib/prisma";

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
