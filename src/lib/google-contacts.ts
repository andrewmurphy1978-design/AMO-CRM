// Google People API client — read-only pull of the connected user's
// Google Contacts, used by importGoogleContactsAction (see
// actions/contacts.ts) to bring personal/old contacts that have no
// systeme.io relationship into the CRM, so their emails and calendar
// events auto-link the same way a systeme.io contact's already do (see
// autoLinkToContacts in email-inbox.ts). This app never writes back to
// Google Contacts — contacts.readonly is the only scope requested (see
// src/app/api/google/connect/route.ts).

interface RawPersonName {
  givenName?: string;
  familyName?: string;
  displayName?: string;
  metadata?: { primary?: boolean };
}

interface RawPersonValue {
  value?: string;
  metadata?: { primary?: boolean };
}

interface RawPersonOrganization {
  name?: string;
  metadata?: { primary?: boolean };
}

interface RawPerson {
  resourceName?: string;
  names?: RawPersonName[];
  emailAddresses?: RawPersonValue[];
  phoneNumbers?: RawPersonValue[];
  organizations?: RawPersonOrganization[];
}

interface RawPeopleConnectionsResponse {
  connections?: RawPerson[];
  nextPageToken?: string;
}

export interface GoogleContactSummary {
  resourceName: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  // Primary value (if Google marked one) first, in case a caller only
  // wants "the" email/phone rather than every one on file.
  emails: string[];
  phones: string[];
  company: string | null;
}

// Value arrays (names/emailAddresses/phoneNumbers) can hold several
// entries — this reorders whichever one Google flagged primary to the
// front without dropping the rest, since a Google contact can genuinely
// have more emails/phones than the CRM's own primary + secondary + extras
// shape assumes any particular one is "the" address.
function primaryFirst<T extends { metadata?: { primary?: boolean } }>(items: T[]): T[] {
  const primaryIndex = items.findIndex((i) => i.metadata?.primary);
  if (primaryIndex <= 0) return items;
  return [items[primaryIndex], ...items.slice(0, primaryIndex), ...items.slice(primaryIndex + 1)];
}

function mapPerson(person: RawPerson): GoogleContactSummary | null {
  if (!person.resourceName) return null;
  const names = primaryFirst(person.names ?? []);
  const name = names[0];
  const emails = primaryFirst(person.emailAddresses ?? [])
    .map((e) => e.value?.trim())
    .filter((v): v is string => Boolean(v));
  const phones = primaryFirst(person.phoneNumbers ?? [])
    .map((p) => p.value?.trim())
    .filter((v): v is string => Boolean(v));
  const organizations = primaryFirst(person.organizations ?? []);

  return {
    resourceName: person.resourceName,
    firstName: name?.givenName?.trim() || null,
    lastName: name?.familyName?.trim() || null,
    displayName: name?.displayName?.trim() || null,
    emails: [...new Set(emails)],
    phones: [...new Set(phones)],
    company: organizations[0]?.name?.trim() || null,
  };
}

// Capped well above any personal address book's realistic size — guards
// against looping forever if Google ever returned a page token that never
// terminates, at the cost of at most 20 subrequests (well inside a
// Cloudflare Worker's per-invocation subrequest budget — see
// refreshEmailInboxCache's comment in email-inbox.ts for the incident that
// budget already caused once).
const MAX_PAGES = 20;
const PAGE_SIZE = 1000;

// Fetches every connection (contact) in the user's default "My Contacts"
// group. Throws on the first page's failure (nothing to show); a later
// page's failure instead returns everything fetched so far, since losing
// contacts already pulled to one bad page is worse than an undercount the
// user can fix by just running Import again (idempotent — see
// importGoogleContactsAction's googleContactId dedupe).
export async function listGoogleContacts(accessToken: string): Promise<GoogleContactSummary[]> {
  const results: GoogleContactSummary[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations");
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (page === 0) throw new Error(`Google Contacts request failed (${res.status})`);
      break;
    }
    const data = (await res.json()) as RawPeopleConnectionsResponse;
    for (const person of data.connections ?? []) {
      const mapped = mapPerson(person);
      if (mapped) results.push(mapped);
    }
    pageToken = data.nextPageToken;
    page += 1;
  } while (pageToken && page < MAX_PAGES);

  return results;
}
