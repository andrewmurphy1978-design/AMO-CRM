import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// One connected Google account (andrewmurphy1978@gmail.com), used for both
// Gmail and Google Calendar via a single OAuth grant (gmail.readonly +
// calendar.readonly). Tokens are stored the same way the systeme.io/Make
// API keys are: encrypted as one JSON blob in IntegrationSetting's
// apiKeyEncrypted column, keeping this on the same established pattern
// instead of adding new columns/tables for one more provider.
interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string; // ISO
}

interface StoredGoogleData {
  tokens: GoogleTokens;
  email: string | null;
}

async function loadStored(): Promise<StoredGoogleData | null> {
  const row = await prisma.integrationSetting.findUnique({ where: { provider: "google" } });
  if (!row?.apiKeyEncrypted) return null;
  try {
    const tokens = JSON.parse(await decryptSecret(row.apiKeyEncrypted)) as GoogleTokens;
    const email = (row.metadata as { email?: string } | null)?.email ?? null;
    return { tokens, email };
  } catch {
    return null;
  }
}

// Google only sends a refresh_token on first consent (or when the
// authorization request forces re-consent) — a later call here (like a
// routine access-token refresh) won't have one, so the existing one is
// carried forward instead of being wiped out.
export async function saveGoogleTokens(
  next: { accessToken: string; refreshToken?: string; expiresAt: string },
  email?: string | null
): Promise<void> {
  const existing = await loadStored();
  const refreshToken = next.refreshToken ?? existing?.tokens.refreshToken;
  if (!refreshToken) {
    throw new Error("Google didn't return a refresh token — disconnect and reconnect to grant access again.");
  }

  const encrypted = await encryptSecret(
    JSON.stringify({ accessToken: next.accessToken, refreshToken, expiresAt: next.expiresAt })
  );
  const metadata = { email: email ?? existing?.email ?? null };

  await prisma.integrationSetting.upsert({
    where: { provider: "google" },
    update: { apiKeyEncrypted: encrypted, metadata },
    create: { provider: "google", apiKeyEncrypted: encrypted, metadata },
  });
}

export async function disconnectGoogle(): Promise<void> {
  await prisma.integrationSetting.deleteMany({ where: { provider: "google" } });
}

export async function getGoogleConnection(): Promise<{ email: string | null } | null> {
  const row = await prisma.integrationSetting.findUnique({ where: { provider: "google" } });
  if (!row?.apiKeyEncrypted) return null;
  return { email: (row.metadata as { email?: string } | null)?.email ?? null };
}

// Returns a valid access token, refreshing it first if it's expired (or
// expiring within a minute). Returns null when Google isn't connected, or
// the refresh itself fails (e.g. the grant was revoked).
export async function getValidAccessToken(): Promise<string | null> {
  const stored = await loadStored();
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

    await saveGoogleTokens({
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
    });
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
  allDay: boolean;
}

// Same reasoning as getRecentEmails above — takes the token directly so no
// Prisma read happens from inside a concurrently-rendered Suspense branch.
export async function getUpcomingEvents(accessToken: string): Promise<CalendarEventSummary[] | null> {
  try {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", new Date().toISOString());
    url.searchParams.set("timeMax", new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "10");

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string } }[];
    };
    return (data.items ?? []).map((item) => ({
      id: item.id,
      title: item.summary || "(untitled)",
      start: item.start?.dateTime ?? item.start?.date ?? null,
      allDay: !item.start?.dateTime,
    }));
  } catch {
    return null;
  }
}
