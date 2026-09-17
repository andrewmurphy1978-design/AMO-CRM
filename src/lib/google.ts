import { prisma, type PrismaClient } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// One personal Google connection per CRM user (Gmail + Calendar,
// read-only) — every team member connects their own account (their real
// Gmail, or a Gmail address their IONOS mailbox forwards to), so this is
// keyed to User.id via the GoogleAccount model rather than the shared,
// provider-keyed IntegrationSetting table the org-wide integrations
// (systeme.io, Make) use.
interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

interface StoredGoogleData {
  tokens: GoogleTokens;
  email: string | null;
}

async function loadStored(userId: string, db: PrismaClient = prisma): Promise<StoredGoogleData | null> {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  if (!row) return null;
  try {
    const tokens = JSON.parse(await decryptSecret(row.tokensEncrypted)) as GoogleTokens;
    return { tokens, email: row.email };
  } catch {
    return null;
  }
}

// Google only sends a refresh_token on first consent (or when the
// authorization request forces re-consent) — a later call here (like a
// routine access-token refresh) won't have one, so the existing one is
// carried forward instead of being wiped out.
export async function saveGoogleTokens(
  userId: string,
  next: { accessToken: string; refreshToken?: string; expiresAt: string },
  email?: string | null,
  db: PrismaClient = prisma
): Promise<void> {
  const existing = await loadStored(userId, db);
  const refreshToken = next.refreshToken ?? existing?.tokens.refreshToken;
  if (!refreshToken) {
    throw new Error("Google didn't return a refresh token — disconnect and reconnect to grant access again.");
  }

  const tokensEncrypted = await encryptSecret(
    JSON.stringify({ accessToken: next.accessToken, refreshToken, expiresAt: next.expiresAt })
  );
  const finalEmail = email ?? existing?.email ?? null;

  await db.googleAccount.upsert({
    where: { userId },
    update: { tokensEncrypted, email: finalEmail },
    create: { userId, tokensEncrypted, email: finalEmail },
  });
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await prisma.googleAccount.deleteMany({ where: { userId } });
}

export async function getGoogleConnection(
  userId: string,
  db: PrismaClient = prisma
): Promise<{ email: string | null } | null> {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  if (!row) return null;
  return { email: row.email };
}

// Returns a valid access token for this user, refreshing it first if it's
// expired (or expiring within a minute). Returns null when this user
// hasn't connected Google, or the refresh itself fails (e.g. the grant
// was revoked).
export async function getValidAccessToken(userId: string, db: PrismaClient = prisma): Promise<string | null> {
  const stored = await loadStored(userId, db);
  if (!stored) return null;

  if (new Date(stored.tokens.expiresAt).getTime() - Date.now() > 60_000) {
    return stored.tokens.accessToken;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: stored.tokens.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    await saveGoogleTokens(
      userId,
      { accessToken: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString() },
      undefined,
      db
    );
    return data.access_token;
  } catch {
    return null;
  }
}

export interface EmailSummary {
  id: string;
  threadId: string; // the CRM's own EmailLink rows are keyed off this
  from: string;
  fromEmail: string; // the bare address, e.g. for the andrewmurphy.online highlight
  toRaw: string; // raw To header (can list several addresses) — for matching, e.g. the Personal page's watched-address check
  subject: string;
  snippet: string;
  date: string; // ISO datetime the message was received
  link: string; // opens this message's thread directly in Gmail's web UI
}

function extractHeader(headers: { name?: string; value?: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// "Andrew Murphy" <andrew@example.com> -> "Andrew Murphy" (falls back to
// the raw header when there's no display name to extract).
function formatFrom(raw: string): string {
  const match = raw.match(/^"?([^"<]*)"?\s*<.*>$/);
  const name = match?.[1]?.trim();
  return name || raw;
}

// "Andrew Murphy" <andrew@example.com> -> "andrew@example.com" (falls back
// to the raw header, trimmed, when there's no angle-bracket address).
function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim();
}

async function fetchEmailSummary(accessToken: string, id: string): Promise<EmailSummary | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id: string;
    threadId?: string;
    snippet?: string;
    internalDate?: string;
    payload?: { headers?: { name?: string; value?: string }[] };
  };
  const headers = data.payload?.headers;
  const threadId = data.threadId ?? data.id;
  const fromHeader = extractHeader(headers, "From");
  // Gmail's own UI shows the message's Date header (when the sender's
  // mail server says it was sent), not internalDate (when Gmail's
  // servers received it) — for bulk/marketing mail routed through
  // multiple relays those can differ by hours, which is what made
  // this page's times look wrong next to Gmail's own. Date header
  // parses fine via the Date constructor (RFC 2822 format); fall
  // back to internalDate only if it's missing or unparseable.
  const dateHeader = extractHeader(headers, "Date");
  const parsedDateHeader = dateHeader ? new Date(dateHeader) : null;
  const date =
    parsedDateHeader && !isNaN(parsedDateHeader.getTime())
      ? parsedDateHeader.toISOString()
      : data.internalDate
        ? new Date(Number(data.internalDate)).toISOString()
        : new Date().toISOString();
  return {
    id: data.id,
    threadId,
    from: formatFrom(fromHeader),
    fromEmail: extractEmailAddress(fromHeader),
    toRaw: extractHeader(headers, "To"),
    subject: extractHeader(headers, "Subject") || "(no subject)",
    snippet: data.snippet ?? "",
    date,
    link: `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
  };
}

// Takes the access token directly rather than fetching it internally —
// this (and getUpcomingEvents below) runs inside a <Suspense> boundary
// alongside other independent boundaries that Next.js renders
// concurrently, and Cloudflare Hyperdrive can't handle two of this app's
// fresh-connection-per-call Prisma reads (see src/lib/prisma.ts) landing
// at the same time; getValidAccessToken's DB read has to happen once,
// sequentially, before any concurrent rendering starts.
//
// null return means "not connected / fetch failed"; [] means connected
// but genuinely zero matching messages. `unreadOnly` is the Dashboard
// card's default (a quick glance at what needs attention); the full Email
// page passes false to browse the regular inbox instead.
export async function getRecentEmails(
  accessToken: string,
  { maxResults = 8, unreadOnly = true }: { maxResults?: number; unreadOnly?: boolean } = {}
): Promise<EmailSummary[] | null> {
  try {
    const query = unreadOnly ? "is:unread in:inbox" : "in:inbox";
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) return null;
    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = listData.messages?.map((m) => m.id) ?? [];
    if (ids.length === 0) return [];

    const messages = await Promise.all(ids.map((id) => fetchEmailSummary(accessToken, id)));
    return messages.filter((m): m is EmailSummary => m !== null);
  } catch {
    return null;
  }
}

// Used by the Personal page — messages either from or to any of a set of
// watched addresses (family members' school/personal accounts), most
// recent first. One Gmail search covering every address at once, rather
// than one search per person.
export async function searchEmailsForAddresses(
  accessToken: string,
  addresses: string[],
  { maxResults = 40 }: { maxResults?: number } = {}
): Promise<EmailSummary[] | null> {
  if (addresses.length === 0) return [];
  try {
    const clauses = addresses.flatMap((a) => [`from:${a}`, `to:${a}`]);
    const query = `(${clauses.join(" OR ")})`;
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) return null;
    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = listData.messages?.map((m) => m.id) ?? [];
    if (ids.length === 0) return [];

    const messages = await Promise.all(ids.map((id) => fetchEmailSummary(accessToken, id)));
    return messages.filter((m): m is EmailSummary => m !== null);
  } catch {
    return null;
  }
}

export interface SentEmailSummary {
  id: string;
  threadId: string;
  to: string;
  toEmail: string;
  subject: string;
  snippet: string;
  date: string; // ISO datetime the message was sent
  link: string; // opens this message's thread directly in Gmail's web UI
}

// Recently sent messages whose thread hasn't seen a reply yet — a
// deterministic "did they answer" check, not a Claude classification, so
// this costs Gmail API calls only, never an AI credit. Always re-checks
// the same fixed window rather than narrowing to "since the last
// check" — a thread sent before the previous refresh is just as
// genuinely still-awaiting as one sent since, and there's no AI cost to
// save by excluding it.
export async function getSentAwaitingReplies(
  accessToken: string,
  { maxResults = 15 }: { maxResults?: number } = {}
): Promise<SentEmailSummary[] | null> {
  try {
    const query = "in:sent newer_than:180d";
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) {
      console.error("getSentAwaitingReplies: messages.list returned", listRes.status, await listRes.text());
      return null;
    }
    // The list response already includes each message's threadId, so
    // there's no need to fetch every message individually just to learn
    // it (as a previous version did) — dedupe straight from here. This
    // and the one thread fetch per distinct thread below are the only
    // two network calls this makes, which matters: Cloudflare Workers
    // cap the number of outgoing requests ("subrequests") a single
    // invocation can make, and the old two-calls-per-message design
    // (fetch the message, then separately fetch its thread) was blowing
    // past that limit once combined with the inbox fetch in the same
    // request, silently killing the whole refresh.
    const listData = (await listRes.json()) as { messages?: { id: string; threadId?: string }[] };
    const threadIds = [...new Set((listData.messages ?? []).map((m) => m.threadId ?? m.id))];
    if (threadIds.length === 0) return [];

    const results = await Promise.all(
      threadIds.map(async (threadId): Promise<SentEmailSummary | null> => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) {
          console.error("getSentAwaitingReplies: thread fetch returned", res.status, await res.text());
          return null;
        }
        const thread = (await res.json()) as {
          messages?: {
            id: string;
            labelIds?: string[];
            internalDate?: string;
            payload?: { headers?: { name?: string; value?: string }[] };
          }[];
        };
        const messages = thread.messages ?? [];
        // The last message in the thread is the one that decides whether
        // it's still "awaiting" — if it's ours (SENT, not also INBOX),
        // nobody has replied since; if a reply arrived, this thread no
        // longer belongs in this list even though it matched `in:sent`.
        const lastMessage = messages[messages.length - 1];
        const stillAwaiting = Boolean(lastMessage?.labelIds?.includes("SENT")) && !lastMessage?.labelIds?.includes("INBOX");
        if (!stillAwaiting || !lastMessage) return null;

        const headers = lastMessage.payload?.headers;
        const toHeader = extractHeader(headers, "To");
        const dateHeader = extractHeader(headers, "Date");
        const parsedDateHeader = dateHeader ? new Date(dateHeader) : null;
        const date =
          parsedDateHeader && !isNaN(parsedDateHeader.getTime())
            ? parsedDateHeader.toISOString()
            : lastMessage.internalDate
              ? new Date(Number(lastMessage.internalDate)).toISOString()
              : new Date().toISOString();
        return {
          id: lastMessage.id,
          threadId,
          to: formatFrom(toHeader),
          toEmail: extractEmailAddress(toHeader),
          subject: extractHeader(headers, "Subject") || "(no subject)",
          snippet: "",
          date,
          link: `https://mail.google.com/mail/u/0/#sent/${threadId}`,
        };
      })
    );

    return results.filter((m): m is SentEmailSummary => m !== null);
  } catch (err) {
    console.error("getSentAwaitingReplies: request failed:", err);
    return null;
  }
}

export interface CalendarEventSummary {
  id: string;
  title: string;
  start: string | null; // ISO datetime, or an ISO date for all-day events
  end: string | null; // ISO datetime, or an ISO date for all-day events
  allDay: boolean;
  colorId: string | null; // Google Calendar's per-event colorId ("1".."11"), null = calendar's default color
  htmlLink: string | null; // opens this event directly in Google Calendar's own UI
  attendeeEmails: string[]; // for the Personal page's watched-address match
}

// Same reasoning as getRecentEmails above — takes the token directly so no
// Prisma read happens from inside a concurrently-rendered Suspense branch.
//
// Fetches today through +15 days — a little wider than the 14 days the
// Dashboard displays, to absorb the UTC-vs-America/Montreal offset (the
// server has no local timezone, so "today" here is computed in UTC; the
// dashboard buckets events into days client-side, where the browser's
// real Montreal time takes over). The Dashboard shows the next 3 days as
// a visual day-grid and the remaining 11 as a scrollable table.
export async function getUpcomingEvents(accessToken: string): Promise<CalendarEventSummary[] | null> {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return getCalendarEventsInRange(
    accessToken,
    startOfToday.toISOString(),
    new Date(startOfToday.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString()
  );
}

interface RawGoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  colorId?: string;
  htmlLink?: string;
  attendees?: { email?: string }[];
}

function mapGoogleEvent(item: RawGoogleEvent): CalendarEventSummary {
  return {
    id: item.id,
    title: item.summary || "(untitled)",
    start: item.start?.dateTime ?? item.start?.date ?? null,
    end: item.end?.dateTime ?? item.end?.date ?? null,
    allDay: !item.start?.dateTime,
    colorId: item.colorId ?? null,
    htmlLink: item.htmlLink ?? null,
    attendeeEmails: (item.attendees ?? []).map((a) => a.email ?? "").filter(Boolean),
  };
}

// Same fetch as above, but for an explicit [timeMin, timeMax) window
// instead of the fixed "today + 12 days" one — used by the multi-view
// Calendar page, which needs whatever range the current view/navigation
// is showing (a month, a week, a single day, ...).
export async function getCalendarEventsInRange(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEventSummary[] | null> {
  try {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: RawGoogleEvent[] };
    return (data.items ?? []).map(mapGoogleEvent);
  } catch {
    return null;
  }
}

// Fetches specific events by id — there's no bulk "get by ids" endpoint in
// the Calendar API, so this is one request per id (fine for the handful of
// events a single contact/project ever has linked). Used by the Calendar
// card on Contact/Project detail pages. Events that 404 (deleted on the
// Google side since being linked) are silently dropped rather than failing
// the whole list.
export async function getCalendarEventsByIds(accessToken: string, eventIds: string[]): Promise<CalendarEventSummary[]> {
  if (eventIds.length === 0) return [];
  const results = await Promise.all(
    eventIds.map(async (id): Promise<CalendarEventSummary | null> => {
      try {
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        return mapGoogleEvent((await res.json()) as RawGoogleEvent);
      } catch {
        return null;
      }
    })
  );
  return results.filter((e): e is CalendarEventSummary => e !== null);
}
