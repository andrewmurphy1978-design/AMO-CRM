// Google People API client — read-only pull of the connected user's
// Google Contacts, used by importGoogleContactsAction (see
// actions/google-contacts.ts) to bring personal/old contacts that have no
// systeme.io relationship into the CRM, so their emails and calendar
// events auto-link the same way a systeme.io contact's already do (see
// autoLinkToContacts in email-inbox.ts). This app never writes back to
// Google Contacts — contacts.readonly is the only scope requested (see
// src/app/api/google/connect/route.ts).
//
// Deliberately NOT imported: ageRanges, genders, interests, skills,
// locales, miscKeywords, relations, events (other than birthdays),
// calendarUrls, sipAddresses, coverPhotos, externalIds, occupations
// (organizations[].title covers job title) — low value for a client/
// personal-contact CRM relative to the mapping complexity, and every one
// of them is additive to add later if it turns out to matter.

interface Primaryable {
  metadata?: { primary?: boolean };
}

interface RawPersonName extends Primaryable {
  givenName?: string;
  familyName?: string;
  displayName?: string;
}

interface RawPersonValue extends Primaryable {
  value?: string;
}

interface RawPersonOrganization extends Primaryable {
  name?: string;
  title?: string;
}

interface RawPersonAddress extends Primaryable {
  streetAddress?: string;
  formattedValue?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

interface RawBirthday extends Primaryable {
  date?: { year?: number; month?: number; day?: number };
}

interface RawPhoto extends Primaryable {
  url?: string;
}

interface RawImClient extends Primaryable {
  username?: string;
  protocol?: string;
  customProtocol?: string;
}

interface RawBiography extends Primaryable {
  value?: string;
}

interface RawUserDefined {
  key?: string;
  value?: string;
}

interface RawMembership {
  contactGroupMembership?: { contactGroupResourceName?: string };
}

interface RawPerson {
  resourceName?: string;
  names?: RawPersonName[];
  nicknames?: { value?: string }[];
  emailAddresses?: RawPersonValue[];
  phoneNumbers?: RawPersonValue[];
  organizations?: RawPersonOrganization[];
  addresses?: RawPersonAddress[];
  birthdays?: RawBirthday[];
  photos?: RawPhoto[];
  urls?: RawPersonValue[];
  imClients?: RawImClient[];
  biographies?: RawBiography[];
  userDefined?: RawUserDefined[];
  memberships?: RawMembership[];
}

interface RawPeopleConnectionsResponse {
  connections?: RawPerson[];
  nextPageToken?: string;
}

interface RawContactGroup {
  resourceName?: string;
  name?: string;
  groupType?: string;
}

interface RawContactGroupsResponse {
  contactGroups?: RawContactGroup[];
  nextPageToken?: string;
}

export interface GoogleAddress {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface GoogleImAccount {
  protocol: string; // e.g. "skype", "gtalk", "aim" — already resolved from customProtocol when Google reports protocol "custom"
  username: string;
}

export interface GoogleCustomField {
  key: string;
  value: string;
}

export interface GoogleContactSummary {
  resourceName: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  nickname: string | null;
  // Primary value (if Google marked one) first, in case a caller only
  // wants "the" email/phone rather than every one on file.
  emails: string[];
  phones: string[];
  company: string | null;
  jobTitle: string | null;
  addresses: GoogleAddress[];
  birthday: string | null; // "YYYY-MM-DD", or "--MM-DD" when Google has no year
  avatarUrl: string | null;
  websites: string[];
  imAccounts: GoogleImAccount[];
  notes: string | null;
  customFields: GoogleCustomField[];
  groupNames: string[]; // resolved via listGoogleContactGroups, USER_CONTACT_GROUP only
}

// Value arrays (names/emailAddresses/phoneNumbers/addresses/urls/photos)
// can hold several entries — this reorders whichever one Google flagged
// primary to the front without dropping the rest, since a Google contact
// can genuinely have more emails/phones than the CRM's own primary +
// secondary + extras shape assumes any particular one is "the" address.
function primaryFirst<T extends Primaryable>(items: T[]): T[] {
  const primaryIndex = items.findIndex((i) => i.metadata?.primary);
  if (primaryIndex <= 0) return items;
  return [items[primaryIndex], ...items.slice(0, primaryIndex), ...items.slice(primaryIndex + 1)];
}

function mapAddress(a: RawPersonAddress): GoogleAddress {
  return {
    address: a.streetAddress?.trim() || a.formattedValue?.trim() || null,
    city: a.city?.trim() || null,
    state: a.region?.trim() || null,
    zip: a.postalCode?.trim() || null,
    country: a.country?.trim() || null,
  };
}

function mapBirthday(birthdays: RawBirthday[]): string | null {
  const date = primaryFirst(birthdays)[0]?.date;
  if (!date?.month || !date.day) return null;
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return date.year ? `${date.year}-${mm}-${dd}` : `--${mm}-${dd}`;
}

function mapImClients(imClients: RawImClient[]): GoogleImAccount[] {
  return imClients
    .map((im) => {
      const username = im.username?.trim();
      const protocol = (im.protocol === "custom" ? im.customProtocol : im.protocol)?.trim();
      if (!username || !protocol) return null;
      return { protocol, username };
    })
    .filter((v): v is GoogleImAccount => v !== null);
}

function mapPerson(person: RawPerson, groupNamesByResource: Map<string, string>): GoogleContactSummary | null {
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
  const websites = primaryFirst(person.urls ?? [])
    .map((u) => u.value?.trim())
    .filter((v): v is string => Boolean(v));
  const groupNames = (person.memberships ?? [])
    .map((m) => m.contactGroupMembership?.contactGroupResourceName)
    .filter((v): v is string => Boolean(v))
    .map((resourceName) => groupNamesByResource.get(resourceName))
    .filter((v): v is string => Boolean(v));

  return {
    resourceName: person.resourceName,
    firstName: name?.givenName?.trim() || null,
    lastName: name?.familyName?.trim() || null,
    displayName: name?.displayName?.trim() || null,
    nickname: person.nicknames?.[0]?.value?.trim() || null,
    emails: [...new Set(emails)],
    phones: [...new Set(phones)],
    company: organizations[0]?.name?.trim() || null,
    jobTitle: organizations[0]?.title?.trim() || null,
    addresses: primaryFirst(person.addresses ?? []).map(mapAddress),
    birthday: mapBirthday(person.birthdays ?? []),
    avatarUrl: primaryFirst(person.photos ?? [])[0]?.url?.trim() || null,
    websites: [...new Set(websites)],
    imAccounts: mapImClients(person.imClients ?? []),
    notes: primaryFirst(person.biographies ?? [])[0]?.value?.trim() || null,
    customFields: (person.userDefined ?? [])
      .map((f) => (f.key?.trim() && f.value?.trim() ? { key: f.key.trim(), value: f.value.trim() } : null))
      .filter((v): v is GoogleCustomField => v !== null),
    groupNames: [...new Set(groupNames)],
  };
}

// Google's error body carries the actually useful message (e.g. "Google
// People API has not been used in project ... or it is disabled. Enable
// it by visiting ...") — a bare HTTP status code tells the user nothing
// they can act on, so this is worth the extra parse.
async function describeError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // fall through to the generic message below
  }
  return `Google Contacts request failed (${res.status})`;
}

// Capped well above any personal address book's realistic size — guards
// against looping forever if Google ever returned a page token that never
// terminates, at the cost of at most 20 subrequests (well inside a
// Cloudflare Worker's per-invocation subrequest budget — see
// refreshEmailInboxCache's comment in email-inbox.ts for the incident that
// budget already caused once).
const MAX_PAGES = 20;
const PAGE_SIZE = 1000;

const PERSON_FIELDS = [
  "names",
  "nicknames",
  "emailAddresses",
  "phoneNumbers",
  "organizations",
  "addresses",
  "birthdays",
  "photos",
  "urls",
  "imClients",
  "biographies",
  "userDefined",
  "memberships",
].join(",");

// contactGroups.list has no metadata to say "system vs. user-created" per
// row beyond groupType — fetched once per import (a handful of requests
// at most; nobody has thousands of contact group labels) and turned into
// a resourceName -> name map, filtered to the labels the user actually
// created (Family, Friends, etc.) rather than Google's built-in "My
// Contacts"/"Starred"/"Blocked" groups, which carry no useful signal here.
async function listUserContactGroupNames(accessToken: string): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let pageToken: string | undefined;
  let page = 0;

  do {
    const url = new URL("https://people.googleapis.com/v1/contactGroups");
    url.searchParams.set("pageSize", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) break; // group labels are a nice-to-have — never fail the whole import over this
    const data = (await res.json()) as RawContactGroupsResponse;
    for (const group of data.contactGroups ?? []) {
      if (group.groupType === "USER_CONTACT_GROUP" && group.resourceName && group.name) {
        result.set(group.resourceName, group.name);
      }
    }
    pageToken = data.nextPageToken;
    page += 1;
  } while (pageToken && page < MAX_PAGES);

  return result;
}

// Fetches every connection (contact) in the user's default "My Contacts"
// group, with every field this app maps (see GoogleContactSummary).
// Throws on the first page's failure (nothing to show); a later page's
// failure instead returns everything fetched so far, since losing
// contacts already pulled to one bad page is worse than an undercount the
// user can fix by just running Import again (idempotent — see
// importGoogleContactsAction's googleContactId dedupe).
export async function listGoogleContacts(accessToken: string): Promise<GoogleContactSummary[]> {
  const groupNamesByResource = await listUserContactGroupNames(accessToken);

  const results: GoogleContactSummary[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    const url = new URL("https://people.googleapis.com/v1/people/me/connections");
    url.searchParams.set("personFields", PERSON_FIELDS);
    url.searchParams.set("pageSize", String(PAGE_SIZE));
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (page === 0) throw new Error(await describeError(res));
      break;
    }
    const data = (await res.json()) as RawPeopleConnectionsResponse;
    for (const person of data.connections ?? []) {
      const mapped = mapPerson(person, groupNamesByResource);
      if (mapped) results.push(mapped);
    }
    pageToken = data.nextPageToken;
    page += 1;
  } while (pageToken && page < MAX_PAGES);

  return results;
}
