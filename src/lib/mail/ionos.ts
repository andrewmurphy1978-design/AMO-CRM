import type { PrismaClient } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { MailSecurity } from "./socket";

// The IONOS mailbox one CRM user reads/sends from — same shape as
// GoogleAccount in src/lib/google.ts: one row per user, every secret
// bundled into a single encrypted JSON blob rather than a column per
// field, following the same precedent the Google integration already set.

export interface IonosCredentials {
  imapHost: string;
  imapPort: number;
  imapSecurity: MailSecurity;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: MailSecurity;
  username: string;
  password: string;
}

export interface IonosMailbox {
  address: string;
  displayName: string | null;
  sentMailbox: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  credentials: IonosCredentials;
}

async function loadStored(userId: string, db: PrismaClient): Promise<IonosMailbox | null> {
  const row = await db.ionosMailboxAccount.findUnique({ where: { userId } });
  if (!row) return null;
  try {
    const credentials = JSON.parse(await decryptSecret(row.credentialsEncrypted)) as IonosCredentials;
    return {
      address: row.address,
      displayName: row.displayName,
      sentMailbox: row.sentMailbox,
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      lastError: row.lastError,
      credentials,
    };
  } catch {
    return null;
  }
}

export async function getIonosMailbox(userId: string, db: PrismaClient): Promise<IonosMailbox | null> {
  return loadStored(userId, db);
}

// A blank `password` in the input means "keep the current one" — the
// Settings form never round-trips the real password back to the client,
// so it can't offer it as a default value the way a non-secret field can.
export async function saveIonosMailbox(
  userId: string,
  input: { address: string; displayName: string | null; credentials: Omit<IonosCredentials, "password"> & { password: string } },
  db: PrismaClient
): Promise<void> {
  const existing = await loadStored(userId, db);
  const password = input.credentials.password || existing?.credentials.password;
  if (!password) throw new Error("A password is required to connect this mailbox for the first time.");

  const credentialsEncrypted = await encryptSecret(JSON.stringify({ ...input.credentials, password }));

  await db.ionosMailboxAccount.upsert({
    where: { userId },
    update: { address: input.address, displayName: input.displayName, credentialsEncrypted },
    create: { userId, address: input.address, displayName: input.displayName, credentialsEncrypted },
  });
}

export async function disconnectIonosMailbox(userId: string, db: PrismaClient): Promise<void> {
  await db.ionosMailboxAccount.deleteMany({ where: { userId } });
}

export async function recordIonosResult(userId: string, db: PrismaClient, error: string | null, sentMailbox?: string): Promise<void> {
  await db.ionosMailboxAccount.updateMany({
    where: { userId },
    data: { lastCheckedAt: new Date(), lastError: error, ...(sentMailbox ? { sentMailbox } : {}) },
  });
}
