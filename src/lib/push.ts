import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// Web Push (RFC 8030 + VAPID RFC 8292 + message encryption RFC 8291, aes128gcm) with nothing but WebCrypto, so it runs in
// a Cloudflare Worker. The server's VAPID key pair is created the first time it is needed and kept (private half
// encrypted) in the integration settings. Same approach as the Mikes scheduling app.

import { type PushCategory } from "@/lib/push-categories";
export { PUSH_CATEGORIES, type PushCategory } from "@/lib/push-categories";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

const b64u = {
  enc(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  dec(s: string): Uint8Array {
    const p = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
  },
};
const utf8 = (s: string) => new TextEncoder().encode(s);
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

interface Vapid {
  publicKey: string;
  privateJwk: JsonWebKey;
}

const VAPID_PROVIDER = "push_vapid";

async function getVapid(db: PrismaClient): Promise<Vapid> {
  const existing = await db.integrationSetting.findUnique({ where: { provider: VAPID_PROVIDER } });
  if (existing?.apiKeyEncrypted) return JSON.parse(await decryptSecret(existing.apiKeyEncrypted));
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const v: Vapid = { publicKey: b64u.enc(await crypto.subtle.exportKey("raw", kp.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
  const apiKeyEncrypted = await encryptSecret(JSON.stringify(v));
  try {
    await db.integrationSetting.create({ data: { provider: VAPID_PROVIDER, apiKeyEncrypted, apiKeyNoExpiry: true } });
    return v;
  } catch {
    // Another request created the keys first: use theirs.
    const won = await db.integrationSetting.findUnique({ where: { provider: VAPID_PROVIDER } });
    return JSON.parse(await decryptSecret(won!.apiKeyEncrypted!));
  }
}

export async function getVapidPublicKey(db: PrismaClient): Promise<string> {
  return (await getVapid(db)).publicKey;
}

async function vapidHeader(vapid: Vapid, endpoint: string, subject: string): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u.enc(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.enc(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(`${head}.${claims}`)));
  return `vapid t=${head}.${claims}.${b64u.enc(sig)}, k=${vapid.publicKey}`;
}

async function encryptPayload(sub: { p256dh: string; auth: string }, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = b64u.dec(sub.p256dh);
  const authSecret = b64u.dec(sub.auth);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic as BufferSource, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256);
  const hkdf = async (ikm: ArrayBuffer | Uint8Array, salt: Uint8Array, info: Uint8Array, bits: number) => {
    const k = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, k, bits));
  };
  const ikm = await hkdf(shared, authSecret, concat(utf8("WebPush: info\0"), uaPublic, asPublic), 256);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(ikm, salt, utf8("Content-Encoding: aes128gcm\0"), 128);
  const nonce = await hkdf(ikm, salt, utf8("Content-Encoding: nonce\0"), 96);
  const aes = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aes, concat(plaintext, new Uint8Array([2])) as BufferSource)); // 0x02 = last record
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendToDevice(vapid: Vapid, subject: string, sub: Sub, payload: PushPayload, urgent: boolean): Promise<"ok" | "gone" | "failed"> {
  try {
    const body = await encryptPayload(sub, utf8(JSON.stringify(payload)));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      body: body as unknown as BodyInit,
      headers: {
        authorization: await vapidHeader(vapid, sub.endpoint, subject),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: "86400",
        urgency: urgent ? "high" : "normal",
      },
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

const SUBJECT = "mailto:andrewmurphy1978@gmail.com";

/** Sends to every device of one user. Returns how many devices accepted it. */
async function pushToUser(db: PrismaClient, vapid: Vapid, userId: string, payload: PushPayload, urgent: boolean): Promise<number> {
  const subs = await db.pushSubscription.findMany({ where: { userId }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
  let ok = 0;
  for (const s of subs) {
    const r = await sendToDevice(vapid, SUBJECT, s, { ...payload, url: payload.url ?? "/" }, urgent);
    if (r === "ok") ok++;
    else if (r === "gone") await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
  }
  return ok;
}

/** A test message to one user's own devices (the Settings "Send a test" button). */
export async function sendTestPush(db: PrismaClient, userId: string, payload: PushPayload): Promise<number> {
  return pushToUser(db, await getVapid(db), userId, payload, true);
}

export interface NotifyOptions {
  /** Which users: a list of ids, or "admins" for every administrator. */
  to: string[] | "admins";
  category: PushCategory;
  /** Same key = sent once per user, however many times the check runs. */
  dedupeKey: string;
  urgent?: boolean;
}

/**
 * Notifies users who have a device registered and the category turned on. Safe to call repeatedly: a user is never
 * notified twice for the same dedupeKey. Never throws (a failing notification must not break the job that raised it).
 */
export async function notifyUsers(db: PrismaClient, opts: NotifyOptions, payload: PushPayload): Promise<number> {
  try {
    const userIds =
      opts.to === "admins" ? (await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id) : opts.to;
    if (userIds.length === 0) return 0;
    const withDevices = await db.pushSubscription.findMany({ where: { userId: { in: userIds } }, select: { userId: true }, distinct: ["userId"] });
    if (withDevices.length === 0) return 0;
    const prefs = await db.pushPreference.findMany({ where: { userId: { in: withDevices.map((d) => d.userId) } } });
    const off = new Map(prefs.map((p) => [p.userId, p.disabled]));
    const vapid = await getVapid(db);
    let sent = 0;
    for (const { userId } of withDevices) {
      if (off.get(userId)?.includes(opts.category)) continue;
      try {
        await db.pushNotificationLog.create({ data: { userId, key: opts.dedupeKey } });
      } catch {
        continue; // already sent
      }
      sent += await pushToUser(db, vapid, userId, { ...payload, tag: payload.tag ?? opts.dedupeKey }, opts.urgent ?? false);
    }
    return sent;
  } catch {
    return 0;
  }
}

/** Housekeeping: the dedupe log only needs the last few days. */
export async function prunePushLog(db: PrismaClient): Promise<void> {
  await db.pushNotificationLog.deleteMany({ where: { sentAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } }).catch(() => undefined);
}
