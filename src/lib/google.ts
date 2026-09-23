import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
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

async function loadStored(userId: string, db: PrismaClient): Promise<StoredGoogleData | null> {
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
  db: PrismaClient,
  email?: string | null
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
  await withScopedPrismaClient((db) => db.googleAccount.deleteMany({ where: { userId } }));
}

export async function getGoogleConnection(userId: string, db: PrismaClient): Promise<{ email: string | null } | null> {
  const row = await db.googleAccount.findUnique({ where: { userId } });
  if (!row) return null;
  return { email: row.email };
}

// Returns a valid access token for this user, refreshing it first if it's
// expired (or expiring within a minute). Returns null when this user
// hasn't connected Google, or the refresh itself fails (e.g. the grant
// was revoked).
export async function getValidAccessToken(userId: string, db: PrismaClient): Promise<string | null> {
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
  // Gmail sets this to whichever of the account's own addresses/aliases a
  // message actually arrived at (more reliable than To/Cc, which show the
  // sender's own addressing and can list addresses that aren't the
  // account's at all). Optional so an EmailInboxCache snapshot cached
  // before this field existed still parses with zero backfill.
  deliveredTo?: string;
  subject: string;
  snippet: string;
  date: string; // ISO datetime the message was received
  link: string; // opens this message's thread directly in Gmail's web UI
  hasAttachments: boolean;
  important: boolean; // the sender marked it Urgent/High priority
  // Both optional so an EmailInboxCache snapshot cached before Phase 4
  // (no IONOS mailbox existed yet) still parses with zero backfill —
  // undefined here means "gmail" with no known Message-ID, same as every
  // row already in a user's cache. messageIdHeader is what
  // refreshEmailInboxCache's merge dedupes an IONOS-forwarded copy of a
  // Gmail message against (see that function's comment).
  source?: "gmail" | "ionos";
  messageIdHeader?: string;
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

// Attachment presence isn't in the message's headers, so it isn't visible
// under format=metadata — it only shows up in the MIME part tree, which
// needs format=full. To keep that from costing extra data transfer per
// message (format=full otherwise inlines every part's base64 body), a
// `fields` partial-response mask asks Gmail for just the parts' filename/
// mimeType skeleton, skipping every part's actual body content.
const MESSAGE_FIELDS =
  "id,threadId,snippet,internalDate,payload(headers,mimeType,filename,parts(filename,mimeType,parts(filename,mimeType,parts(filename,mimeType))))";

interface MessagePart {
  filename?: string;
  mimeType?: string;
  parts?: MessagePart[];
}

function hasAttachmentPart(part: MessagePart | undefined): boolean {
  if (!part) return false;
  if (part.filename && part.filename.length > 0) return true;
  return (part.parts ?? []).some(hasAttachmentPart);
}

// The sender's own "Mark as important/urgent" flag (Outlook and most mail
// clients set one of these headers) — distinct from Gmail's own ML-driven
// "importance" heuristic, which isn't a reliable "this was sent as
// urgent" signal.
function isMarkedImportant(headers: { name?: string; value?: string }[] | undefined): boolean {
  const importance = extractHeader(headers, "Importance").toLowerCase();
  const priority = extractHeader(headers, "X-Priority").toLowerCase();
  return importance === "high" || priority === "1" || priority === "highest";
}

async function fetchEmailSummary(accessToken: string, id: string): Promise<EmailSummary | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full&fields=${encodeURIComponent(MESSAGE_FIELDS)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    id: string;
    threadId?: string;
    snippet?: string;
    internalDate?: string;
    payload?: MessagePart & { headers?: { name?: string; value?: string }[] };
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
    deliveredTo: extractHeader(headers, "Delivered-To").trim() || undefined,
    subject: extractHeader(headers, "Subject") || "(no subject)",
    snippet: data.snippet ?? "",
    date,
    link: `https://mail.google.com/mail/u/0/#inbox/${threadId}`,
    hasAttachments: hasAttachmentPart(data.payload),
    important: isMarkedImportant(headers),
    source: "gmail",
    messageIdHeader: extractHeader(headers, "Message-ID").trim() || undefined,
  };
}

// Fetches the message's full RFC 5322 body (headers + every MIME part,
// base64url-encoded) for the Email Dialog's "open a message" view —
// deliberately a separate, more expensive call from fetchEmailSummary
// above, whose `fields` mask exists specifically to keep the *list* cheap
// by excluding part bodies (same "cheap list, expensive detail-on-open"
// split already used by fetchCalendarEventDetail for Calendar). Returns
// the decoded raw message text (still MIME-encoded, i.e. what
// mime-parse.ts's parseMessage expects) plus the Gmail threadId (needed to
// reply within the same thread), or null on any failure.
export async function fetchGmailMessageRaw(accessToken: string, id: string): Promise<{ raw: string; threadId: string } | null> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { raw?: string; threadId?: string };
  if (!data.raw) return null;
  return { raw: decodeBase64UrlToBinaryString(data.raw), threadId: data.threadId ?? id };
}

// A Gmail thread's own `id` is only sometimes the id of a real, fetchable
// message — it happens to match for many threads, but not reliably (a
// single-message "SENT" thread, for one, has been seen with a distinct
// message id) — so anything that only has a thread id (EmailLink rows,
// which store one per thread rather than per message) needs this lookup
// before it can fetch a body. `format=minimal` keeps it to just ids/labels,
// no bodies, since all that's wanted here is which real message to fetch
// next. Returns the most recent message's id (closest to what a
// "messageDate"/"fromLabel" snapshot taken at link time would have meant),
// or null if the thread itself can't be found.
export async function resolveGmailThreadLatestMessageId(accessToken: string, threadId: string): Promise<string | null> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=minimal`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { messages?: { id: string }[] };
  const messages = data.messages ?? [];
  return messages.length > 0 ? messages[messages.length - 1].id : null;
}

// Gmail's `raw` field is base64url (RFC 4648 §5: "-"/"_", no padding).
// Decoded to a "binary string" (one JS char per byte) rather than UTF-8
// text — mime-parse.ts's parser expects that convention throughout, since
// charset decoding only happens once a leaf MIME part's own
// Content-Transfer-Encoding has been undone.
function decodeBase64UrlToBinaryString(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return atob(padded);
}

// The reverse of the above — mime-build.ts hands back a "binary string"
// RFC 5322 message (one JS char per byte); Gmail's send endpoint wants
// that same message base64url-encoded, no padding.
function encodeBinaryStringToBase64Url(raw: string): string {
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Sends a message built by mime-build.ts's buildMimeMessage. Passing
// `threadId` keeps a reply in the same Gmail thread — Gmail also needs the
// raw message's own In-Reply-To/References headers to actually thread it
// correctly in every client, which buildMimeMessage already sets, so
// threadId here is a belt-and-suspenders addition, not the only thing
// doing the work.
export async function sendGmailMessage(
  accessToken: string,
  raw: string,
  threadId?: string
): Promise<{ id: string; threadId: string } | { error: string }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodeBinaryStringToBase64Url(raw), ...(threadId ? { threadId } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `Gmail send failed (${res.status})${body ? `: ${body.slice(0, 300)}` : ""}` };
  }
  const data = (await res.json()) as { id: string; threadId: string };
  return { id: data.id, threadId: data.threadId };
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
  // "awaiting": the last message in the thread is still ours (no reply
  // yet). "completed": a reply has since arrived — kept in the list
  // (rather than dropped) so the Email page can show it under Completed
  // instead of it just vanishing.
  status: "awaiting" | "completed";
  // Which of the account's own addresses/aliases this was sent from — the
  // Email list's colored-dot match for Sent rows (see EmailSummary's
  // deliveredTo comment for the received-side equivalent). Optional so a
  // cached snapshot from before this field existed still parses.
  fromEmail?: string;
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
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
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
        // nobody has replied since; if a reply arrived, the thread moves
        // to "completed" instead of being dropped, so it can still show
        // up under the Email page's Completed section.
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) return null;
        const stillAwaiting = Boolean(lastMessage.labelIds?.includes("SENT")) && !lastMessage.labelIds?.includes("INBOX");

        const headers = lastMessage.payload?.headers;
        const toHeader = extractHeader(headers, "To");
        const fromHeader = extractHeader(headers, "From");
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
          status: stillAwaiting ? "awaiting" : "completed",
          fromEmail: extractEmailAddress(fromHeader) || undefined,
        };
      })
    );

    return results.filter((m): m is SentEmailSummary => m !== null);
  } catch (err) {
    console.error("getSentAwaitingReplies: request failed:", err);
    return null;
  }
}

export interface DraftSummary {
  id: string; // Gmail draft id (distinct from any message id)
  threadId: string;
  to: string;
  subject: string;
  snippet: string;
  date: string; // ISO — the draft's own internalDate (last saved)
  link: string; // opens the draft directly in Gmail's compose window
}

// Every saved-but-unsent draft in the Gmail account's Drafts folder — the
// Email page's "Drafts waiting for your approval" section, so a draft
// started (by hand or by an assistant) doesn't sit forgotten outside the
// CRM. `drafts.list` only returns bare ids, so each one needs its own
// metadata fetch, same two-step shape as getSentAwaitingReplies above.
export async function getDrafts(accessToken: string, { maxResults = 20 }: { maxResults?: number } = {}): Promise<DraftSummary[] | null> {
  try {
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=${maxResults}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!listRes.ok) {
      console.error("getDrafts: drafts.list returned", listRes.status, await listRes.text());
      return null;
    }
    const listData = (await listRes.json()) as { drafts?: { id: string }[] };
    const draftIds = (listData.drafts ?? []).map((d) => d.id);
    if (draftIds.length === 0) return [];

    const results = await Promise.all(
      draftIds.map(async (draftId): Promise<DraftSummary | null> => {
        const res = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}?format=metadata&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          id: string;
          message?: {
            id: string;
            threadId?: string;
            snippet?: string;
            internalDate?: string;
            payload?: { headers?: { name?: string; value?: string }[] };
          };
        };
        const headers = data.message?.payload?.headers;
        const toHeader = extractHeader(headers, "To");
        const dateHeader = extractHeader(headers, "Date");
        const parsedDateHeader = dateHeader ? new Date(dateHeader) : null;
        const date =
          parsedDateHeader && !isNaN(parsedDateHeader.getTime())
            ? parsedDateHeader.toISOString()
            : data.message?.internalDate
              ? new Date(Number(data.message.internalDate)).toISOString()
              : new Date().toISOString();
        return {
          id: data.id,
          threadId: data.message?.threadId ?? data.id,
          to: toHeader ? formatFrom(toHeader) : "",
          subject: extractHeader(headers, "Subject") || "(no subject)",
          snippet: data.message?.snippet ?? "",
          date,
          link: `https://mail.google.com/mail/u/0/#drafts?compose=${data.message?.id ?? data.id}`,
        };
      })
    );
    return results.filter((d): d is DraftSummary => d !== null);
  } catch (err) {
    console.error("getDrafts: request failed:", err);
    return null;
  }
}

// The Drafts section's "open to review" call — the full raw MIME of a
// saved draft, same shape fetchGmailMessageRaw returns for a real message
// (feeds the same mime-parse.ts parser) plus the draft's own id, needed
// separately from its message id to later delete or resend it.
export async function fetchGmailDraftRaw(
  accessToken: string,
  draftId: string
): Promise<{ raw: string; threadId: string; messageId: string } | null> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}?format=raw`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; message?: { id: string; threadId?: string; raw?: string } };
  if (!data.message?.raw) return null;
  return { raw: decodeBase64UrlToBinaryString(data.message.raw), threadId: data.message.threadId ?? draftId, messageId: data.message.id };
}

// Removes a draft after it's been sent or explicitly discarded — a no-op
// (not an error) if it's already gone, since either outcome leaves the
// draft where the caller wants it: not in the Drafts folder.
export async function deleteGmailDraft(accessToken: string, draftId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok || res.status === 404;
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
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
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

export interface CalendarAttendee {
  email: string;
  displayName: string | null;
  responseStatus: string | null; // "needsAction" | "accepted" | "declined" | "tentative"
}

export interface CalendarEventDetail {
  id: string;
  title: string;
  description: string;
  location: string;
  start: string | null; // ISO datetime, or an ISO date (yyyy-MM-dd) for all-day
  end: string | null;
  allDay: boolean;
  colorId: string | null;
  htmlLink: string | null;
  attendees: CalendarAttendee[];
  recurrence: string[]; // raw RRULE/EXDATE lines, e.g. ["RRULE:FREQ=WEEKLY;COUNT=10"]
  recurringEventId: string | null; // set when this is one instance of a recurring event
  visibility: "default" | "public" | "private";
  transparency: "opaque" | "transparent"; // opaque = busy, transparent = free
  reminderUseDefault: boolean;
  reminderOverrides: number[]; // custom override minutes, when useDefault is false (Google allows up to 5)
  timeZone: string | null; // IANA zone the event's own start carries, e.g. "America/Montreal"
  organizerName: string | null; // the connected Google account's own display name/email
}

// The shape the event dialog submits — always sends every field (rather
// than a partial diff), so clearing a field in the form really clears it
// on the Google side too instead of leaving the old value untouched.
//
// start/end are "floating" local wall-clock strings (yyyy-MM-ddTHH:mm:ss,
// no trailing Z/offset) paired with an explicit IANA `timeZone` — exactly
// the shape Google's own Calendar UI submits, and the only way to let the
// user pick a timezone independent of the browser's own: a bare ISO string
// with a "Z"/offset baked in would already have committed to some specific
// UTC instant before timeZone even entered the picture.
export interface CalendarEventInput {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  start: string; // floating local datetime, or yyyy-MM-dd when allDay
  end: string;
  timeZone: string; // ignored when allDay (Google's all-day events carry no timeZone)
  colorId: string | null;
  attendeeEmails: string[];
  recurrence: string[];
  visibility: "default" | "public" | "private";
  transparency: "opaque" | "transparent";
  reminderUseDefault: boolean;
  reminderOverrides: number[]; // custom override minutes (Google allows up to 5); ignored when reminderUseDefault
}

interface RawGoogleEventDetail extends RawGoogleEvent {
  description?: string;
  location?: string;
  attendees?: { email?: string; displayName?: string; responseStatus?: string }[];
  recurrence?: string[];
  recurringEventId?: string;
  visibility?: string;
  transparency?: string;
  reminders?: { useDefault?: boolean; overrides?: { method?: string; minutes?: number }[] };
}

function mapGoogleEventDetail(item: RawGoogleEventDetail, organizerName: string | null): CalendarEventDetail {
  const summary = mapGoogleEvent(item);
  return {
    ...summary,
    description: item.description ?? "",
    location: item.location ?? "",
    attendees: (item.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      displayName: a.displayName ?? null,
      responseStatus: a.responseStatus ?? null,
    })),
    recurrence: item.recurrence ?? [],
    recurringEventId: item.recurringEventId ?? null,
    visibility: (item.visibility as CalendarEventDetail["visibility"]) ?? "default",
    transparency: (item.transparency as CalendarEventDetail["transparency"]) ?? "opaque",
    reminderUseDefault: item.reminders?.useDefault ?? true,
    reminderOverrides: (item.reminders?.overrides ?? []).map((o) => o.minutes).filter((m): m is number => typeof m === "number"),
    timeZone: item.start?.timeZone ?? null,
    organizerName,
  };
}

// The calendar's own default reminders (Settings > primary calendar's
// notification list in Google Calendar's UI) — fetched separately from any
// one event, since an event using `reminders.useDefault` doesn't carry
// these minutes itself; the event/create dialogs need them to show what
// "Default notification" actually means instead of just that label.
export async function getPrimaryCalendarDefaultReminders(accessToken: string): Promise<number[]> {
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList/primary", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { defaultReminders?: { minutes?: number }[] };
    return (data.defaultReminders ?? []).map((r) => r.minutes).filter((m): m is number => typeof m === "number");
  } catch {
    return [];
  }
}

// Full single-event fetch for the edit dialog — the list/range endpoints
// above only return the summary fields those views actually render, not
// description/location/attendees/recurrence/etc. `organizerName` is just
// passed through onto the mapped result (the connected Google account's
// own display name/email) — there's no per-event "calendar name" to fetch
// since this app only ever touches the one "primary" calendar.
export async function getCalendarEvent(
  accessToken: string,
  eventId: string,
  organizerName: string | null = null
): Promise<CalendarEventDetail | null> {
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as RawGoogleEventDetail;

    // A single occurrence of a recurring event carries recurringEventId but
    // no recurrence array of its own — only the master event has the RRULE
    // — so the view dialog's "Weekly on Thursday" description needs one
    // extra fetch here rather than silently having nothing to describe.
    if ((raw.recurrence?.length ?? 0) === 0 && raw.recurringEventId) {
      try {
        const masterRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${raw.recurringEventId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (masterRes.ok) {
          const master = (await masterRes.json()) as { recurrence?: string[] };
          raw.recurrence = master.recurrence ?? [];
        }
      } catch {
        // Leave recurrence empty — the description just won't show.
      }
    }

    return mapGoogleEventDetail(raw, organizerName);
  } catch {
    return null;
  }
}

function buildEventBody(input: CalendarEventInput): Record<string, unknown> {
  const time = input.allDay ? { date: input.start } : { dateTime: input.start, timeZone: input.timeZone };
  const endTime = input.allDay ? { date: input.end } : { dateTime: input.end, timeZone: input.timeZone };
  return {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: time,
    end: endTime,
    colorId: input.colorId || undefined,
    attendees: input.attendeeEmails.map((email) => ({ email })),
    recurrence: input.recurrence.length > 0 ? input.recurrence : undefined,
    visibility: input.visibility,
    transparency: input.transparency,
    reminders: input.reminderUseDefault
      ? { useDefault: true }
      : {
          useDefault: false,
          overrides: input.reminderOverrides.map((minutes) => ({ method: "popup", minutes })),
        },
  };
}

// `sendUpdates=all` on both create and update — without it Google still
// saves the attendee list, but never actually emails the invite/change to
// them, which is what made "Add guest" look like it did nothing even
// though the name was really being stored.
export async function createCalendarEvent(accessToken: string, input: CalendarEventInput): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildEventBody(input)),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("createCalendarEvent failed:", res.status, text);
      return { error: `Google Calendar returned ${res.status}` };
    }
    const data = (await res.json()) as { id: string };
    return { id: data.id };
  } catch (err) {
    console.error("createCalendarEvent failed:", err);
    return { error: "Request to Google Calendar failed" };
  }
}

export async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  input: CalendarEventInput
): Promise<{ error?: string }> {
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildEventBody(input)),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("updateCalendarEvent failed:", res.status, text);
      return { error: `Google Calendar returned ${res.status}` };
    }
    return {};
  } catch (err) {
    console.error("updateCalendarEvent failed:", err);
    return { error: "Request to Google Calendar failed" };
  }
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<{ error?: string }> {
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Google returns 410 Gone for an event that's already been deleted on
    // its side — treat that the same as success rather than surfacing an
    // error for a delete that, from the user's perspective, already happened.
    if (!res.ok && res.status !== 410) {
      const text = await res.text();
      console.error("deleteCalendarEvent failed:", res.status, text);
      return { error: `Google Calendar returned ${res.status}` };
    }
    return {};
  } catch (err) {
    console.error("deleteCalendarEvent failed:", err);
    return { error: "Request to Google Calendar failed" };
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
