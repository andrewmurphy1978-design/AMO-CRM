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

export async function loadCredentials(db: PrismaClient, mailboxId: string): Promise<{ address: string; displayName: string | null; creds: SharedCredentials } | null> {
  const row = await db.sharedMailbox.findUnique({ where: { id: mailboxId } });
  if (!row) return null;
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
