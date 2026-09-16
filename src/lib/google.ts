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
  from: string;
  subject: string;
  snippet: string;
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

// Takes the access token directly rather than fetching it internally —
// this (and getUpcomingEvents below) runs inside a <Suspense> boundary
// alongside other independent boundaries that Next.js renders
// concurrently, and Cloudflare Hyperdrive can't handle two of this app's
// fresh-connection-per-call Prisma reads (see src/lib/prisma.ts) landing
// at the same time; getValidAccessToken's DB read has to happen once,
// sequentially, before any concurrent rendering starts.
//
// null return means "not connected / fetch failed"; [] means connected
// but genuinely zero unread messages.
export async function getRecentEmails(accessToken: string, maxResults = 8): Promise<EmailSummary[] | null> {
  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent("is:unread in:inbox")}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) return null;
    const listData = (await listRes.json()) as { messages?: { id: string }[] };
    const ids = listData.messages?.map((m) => m.id) ?? [];
    if (ids.length === 0) return [];

    const messages = await Promise.all(
      ids.map(async (id): Promise<EmailSummary | null> => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          id: string;
          snippet?: string;
          payload?: { headers?: { name?: string; value?: string }[] };
        };
        const headers = data.payload?.headers;
        return {
          id: data.id,
          from: formatFrom(extractHeader(headers, "From")),
          subject: extractHeader(headers, "Subject") || "(no subject)",
          snippet: data.snippet ?? "",
        };
      })
    );
    return messages.filter((m): m is EmailSummary => m !== null);
  } catch {
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
}

// Same reasoning as getRecentEmails above — takes the token directly so no
// Prisma read happens from inside a concurrently-rendered Suspense branch.
//
// Fetches a full week (today through +8 days, a little wider than a week
// to absorb the UTC-vs-America/Montreal offset — the server has no local
// timezone, so "today" here is computed in UTC; the dashboard buckets
// events into days client-side, where the browser's real Montreal time
// takes over). The Dashboard shows the next 3 days as a visual day-grid
// and the remaining 4 as a table.
export async function getUpcomingEvents(accessToken: string): Promise<CalendarEventSummary[] | null> {
  try {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", startOfToday.toISOString());
    url.searchParams.set("timeMax", new Date(startOfToday.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "100");

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: {
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        colorId?: string;
        htmlLink?: string;
      }[];
    };
    return (data.items ?? []).map((item) => ({
      id: item.id,
      title: item.summary || "(untitled)",
      start: item.start?.dateTime ?? item.start?.date ?? null,
      end: item.end?.dateTime ?? item.end?.date ?? null,
      allDay: !item.start?.dateTime,
      colorId: item.colorId ?? null,
      htmlLink: item.htmlLink ?? null,
    }));
  } catch {
    return null;
  }
}
