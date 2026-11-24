import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { PrismaClient } from "@/lib/prisma";

// Passkey (WebAuthn) sign-in: Face ID / fingerprint on a phone, Windows Hello PIN or biometrics on a PC. The device
// keeps the private key; we keep its public key (Passkey) and hand out one-time challenges (WebAuthnChallenge) for
// the device to sign.

export const CHALLENGE_COOKIE = "amo_webauthn";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type Purpose = "register" | "login";

// The passkey is bound to the site's hostname (crm.andrewmurphy.online in production, localhost in development) —
// taken from NEXTAUTH_URL when set, like the Google connect routes, else from the request.
export function relyingParty(requestUrl: string) {
  const url = new URL(process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? requestUrl);
  return { rpID: url.hostname, origin: url.origin, secure: url.protocol === "https:" };
}

export function challengeCookie(id: string, secure: boolean) {
  return { name: CHALLENGE_COOKIE, value: id, httpOnly: true, secure, sameSite: "strict" as const, path: "/", maxAge: CHALLENGE_TTL_MS / 1000 };
}

export function readChallengeCookie(cookieHeader: string | null): string | null {
  const match = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${CHALLENGE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function storeChallenge(db: PrismaClient, purpose: Purpose, challenge: string, userId: string | null): Promise<string> {
  await db.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const row = await db.webAuthnChallenge.create({
    data: { purpose, challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
  });
  return row.id;
}

// Deleting the row is what makes a challenge single-use: a second attempt with the same one finds nothing.
async function consumeChallenge(db: PrismaClient, id: string | null, purpose: Purpose): Promise<{ challenge: string; userId: string | null } | null> {
  if (!id) return null;
  const row = await db.webAuthnChallenge.delete({ where: { id } }).catch(() => null);
  if (!row || row.purpose !== purpose || row.expiresAt < new Date()) return null;
  return { challenge: row.challenge, userId: row.userId };
}

export async function startRegistration(db: PrismaClient, user: { id: string; email: string; name: string }, rpID: string) {
  const existing = await db.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
  const options = await generateRegistrationOptions({
    rpName: "AMO CRM",
    rpID,
    userName: user.email,
    userDisplayName: user.name,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
    // Discoverable credential + required user verification: the login button works without typing an email, and
    // the device always asks for the face/finger/PIN.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  });
  const challengeId = await storeChallenge(db, "register", options.challenge, user.id);
  return { options, challengeId };
}

export async function finishRegistration(
  db: PrismaClient,
  args: { userId: string; challengeId: string | null; response: RegistrationResponseJSON; deviceName: string; rpID: string; origin: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pending = await consumeChallenge(db, args.challengeId, "register");
  if (!pending || pending.userId !== args.userId) return { ok: false, error: "expired" };
  const result = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge: pending.challenge,
    expectedOrigin: args.origin,
    expectedRPID: args.rpID,
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified || !result.registrationInfo) return { ok: false, error: "not_verified" };
  const { credential } = result.registrationInfo;
  await db.passkey.create({
    data: {
      userId: args.userId,
      credentialId: credential.id,
      publicKey: new Uint8Array(credential.publicKey),
      counter: BigInt(credential.counter),
      transports: args.response.response.transports ?? credential.transports ?? [],
      deviceName: args.deviceName.trim().slice(0, 60) || "Device",
    },
  });
  return { ok: true };
}

export async function startLogin(db: PrismaClient, rpID: string) {
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
  const challengeId = await storeChallenge(db, "login", options.challenge, null);
  return { options, challengeId };
}

/** Verifies a sign-in with a passkey; returns the user it belongs to, or null. */
export async function finishLogin(db: PrismaClient, args: { challengeId: string | null; response: AuthenticationResponseJSON; rpID: string; origin: string }) {
  const pending = await consumeChallenge(db, args.challengeId, "login");
  if (!pending) return null;
  const passkey = await db.passkey.findUnique({ where: { credentialId: args.response.id }, include: { user: true } });
  if (!passkey) return null;
  const result = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge: pending.challenge,
    expectedOrigin: args.origin,
    expectedRPID: args.rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: Number(passkey.counter),
      transports: passkey.transports as AuthenticatorTransportFuture[],
    },
    requireUserVerification: true,
  }).catch(() => null);
  if (!result?.verified) return null;
  await db.passkey.update({
    where: { id: passkey.id },
    data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
  });
  return passkey.user;
}
