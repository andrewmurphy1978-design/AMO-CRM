import type { PrismaClient } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { ImapConfig } from "./imap";
import type { SmtpConfig } from "./smtp";
import type { MailSecurity } from "./socket";
import type { MailboxLevel } from "./shared-levels";

export interface SharedCredentials {
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  username: string;
  password: string;
}

export interface GoogleMailboxTokens { accessToken: string; refreshToken: string; expiresAt: string }

export type LoadedMailbox =
  | { kind: "imap"; address: string; displayName: string | null; creds: SharedCredentials }
  | { kind: "google"; address: string; displayName: string | null; tokens: GoogleMailboxTokens | null };

/** The mailbox as stored: IMAP/SMTP credentials, or the Google sign-in tokens of a "Connect with Google" mailbox. */
export async function loadMailbox(db: PrismaClient, mailboxId: string): Promise<LoadedMailbox | null> {
  const row = await db.sharedMailbox.findUnique({ where: { id: mailboxId } });
  if (!row) return null;
  try {
    const data = JSON.parse(await decryptSecret(row.credentialsEncrypted));
    if (row.provider === "google-oauth") {
      return { kind: "google", address: row.address, displayName: row.displayName, tokens: data.refreshToken ? (data as GoogleMailboxTokens) : null };
    }
    return { kind: "imap", address: row.address, displayName: row.displayName, creds: data as SharedCredentials };
  } catch {
    return null;
  }
}

export async function saveMailboxGoogleTokens(db: PrismaClient, mailboxId: string, tokens: GoogleMailboxTokens): Promise<void> {
  await db.sharedMailbox.update({ where: { id: mailboxId }, data: { credentialsEncrypted: await encryptSecret(JSON.stringify(tokens)), lastError: null } });
}

/** A working Gmail access token for a "Connect with Google" mailbox, refreshed when it is about to expire. */
export async function getMailboxAccessToken(db: PrismaClient, mailboxId: string): Promise<string | null> {
  const box = await loadMailbox(db, mailboxId);
  if (!box || box.kind !== "google" || !box.tokens) return null;
  if (new Date(box.tokens.expiresAt).getTime() - Date.now() > 60_000) return box.tokens.accessToken;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: box.tokens.refreshToken, grant_type: "refresh_token" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    await saveMailboxGoogleTokens(db, mailboxId, { accessToken: data.access_token, refreshToken: box.tokens.refreshToken, expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString() });
    return data.access_token;
  } catch {
    return null;
  }
}

export async function loadCredentials(db: PrismaClient, mailboxId: string): Promise<{ address: string; displayName: string | null; creds: SharedCredentials } | null> {
  const row = await db.sharedMailbox.findUnique({ where: { id: mailboxId } });
  if (!row || row.provider === "google-oauth") return null;
  try {
    return { address: row.address, displayName: row.displayName, creds: JSON.parse(await decryptSecret(row.credentialsEncrypted)) as SharedCredentials };
  } catch {
    return null;
  }
}

export const imapOf = (c: SharedCredentials): ImapConfig => ({ host: c.imapHost, port: c.imapPort, security: c.imapSecurity, username: c.username, password: c.password });
export const smtpOf = (c: SharedCredentials): SmtpConfig => ({ host: c.smtpHost, port: c.smtpPort, security: c.smtpSecurity, username: c.username, password: c.password });

export const encryptCredentials = (c: SharedCredentials) => encryptSecret(JSON.stringify(c));

/** This user's level in a mailbox. Admins have everything; nobody can delete. */
export async function mailboxLevel(db: PrismaClient, user: { id: string; role: string }, mailboxId: string): Promise<MailboxLevel> {
  if (user.role === "ADMIN") return "COMPLETE";
  const row = await db.sharedMailboxAccess.findUnique({ where: { mailboxId_userId: { mailboxId, userId: user.id } } });
  return ((row?.level as MailboxLevel) ?? "NONE");
}
