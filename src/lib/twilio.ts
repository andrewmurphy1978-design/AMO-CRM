import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { toE164 } from "@/lib/phone-display";

// Twilio SMS: one account for the whole CRM, stored on the shared
// IntegrationSetting row (provider "twilio") — the Account SID + Auth Token
// as one encrypted JSON blob in apiKeyEncrypted, the sending number (not a
// secret) in metadata.

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string; // E.164, e.g. +18195551234
}

export async function getTwilioConfig(db: PrismaClient): Promise<TwilioConfig | null> {
  const row = await db.integrationSetting.findUnique({ where: { provider: "twilio" } });
  if (!row?.apiKeyEncrypted) return null;
  const fromNumber = (row.metadata as { fromNumber?: string } | null)?.fromNumber;
  if (!fromNumber) return null;
  try {
    const { accountSid, authToken } = JSON.parse(await decryptSecret(row.apiKeyEncrypted)) as { accountSid: string; authToken: string };
    return accountSid && authToken ? { accountSid, authToken, fromNumber } : null;
  } catch {
    return null;
  }
}

// The public base URL Twilio calls back on. NEXTAUTH_URL is what the rest of
// the app already treats as its canonical address.
export function publicBaseUrl(fallbackOrigin?: string): string | null {
  return (process.env.NEXTAUTH_URL ?? fallbackOrigin ?? "").replace(/\/$/, "") || null;
}

// Twilio signs each webhook: base64(HMAC-SHA1(authToken, fullUrl + every POST
// param name+value, sorted by name)). Web Crypto rather than node:crypto so
// it behaves the same on Cloudflare Workers.
export async function verifyTwilioSignature(url: string, params: URLSearchParams, signature: string | null, authToken: string): Promise<boolean> {
  if (!signature) return false;
  const sorted = [...params.keys()].filter((k, i, all) => all.indexOf(k) === i).sort();
  const data = sorted.reduce((acc, key) => acc + key + params.getAll(key).join(""), url);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
  let binary = "";
  for (const byte of mac) binary += String.fromCharCode(byte);
  const expected = btoa(binary);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function basicAuth(config: Pick<TwilioConfig, "accountSid" | "authToken">): string {
  return `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`;
}

// Confirms an SID/token pair is real before it's saved.
export async function verifyTwilioCredentials(accountSid: string, authToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`, {
      headers: { Authorization: basicAuth({ accountSid, authToken }) },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendTwilioSms(
  config: TwilioConfig,
  to: string,
  body: string,
  statusCallback: string | null
): Promise<{ sid: string; status: string } | { error: string; code?: string }> {
  try {
    const form = new URLSearchParams({ To: to, From: config.fromNumber, Body: body });
    if (statusCallback) form.set("StatusCallback", statusCallback);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: basicAuth(config), "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const data = (await res.json().catch(() => null)) as { sid?: string; status?: string; message?: string; code?: number } | null;
    if (!res.ok || !data?.sid) {
      return { error: data?.message ? `Twilio: ${data.message}${data.code ? ` (${data.code})` : ""}` : `Twilio returned ${res.status}.` };
    }
    return { sid: data.sid, status: data.status ?? "queued" };
  } catch (e) {
    return { error: `Couldn't reach Twilio (${e instanceof Error ? e.message : "unknown error"}).` };
  }
}

// Digits-only comparison key: the last 10 digits, so "+1 (819) 555-1234",
// "8195551234" and "18195551234" all match (NANP numbers only need 10).
function phoneKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = (toE164(value, "CA") ?? value).replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

// Finds the contact one of whose phone numbers is this E.164 number.
export async function findContactIdByPhone(db: PrismaClient, e164: string): Promise<string | null> {
  const key = phoneKey(e164);
  if (!key) return null;
  const candidates = await db.contact.findMany({
    where: { OR: [{ phone: { not: null } }, { phone2: { not: null } }, { extraPhones: { isEmpty: false } }] },
    select: { id: true, phone: true, phone2: true, extraPhones: true },
  });
  for (const c of candidates) {
    if ([c.phone, c.phone2, ...c.extraPhones].some((p) => phoneKey(p) === key)) return c.id;
  }
  return null;
}

// A contact's phone numbers as E.164, for the "send to" picker.
export function contactPhoneOptions(contact: { phone: string | null; phone2: string | null; extraPhones: string[] }): { value: string; label: string }[] {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const raw of [contact.phone, contact.phone2, ...contact.extraPhones]) {
    if (!raw) continue;
    const e164 = toE164(raw, "CA");
    if (!e164 || !e164.startsWith("+") || seen.has(e164)) continue;
    seen.add(e164);
    out.push({ value: e164, label: raw });
  }
  return out;
}
