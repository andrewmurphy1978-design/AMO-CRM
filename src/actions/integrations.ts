"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { encryptSecret } from "@/lib/crypto";
import { runSystemeIoSync } from "@/lib/sync";
import { disconnectGoogle } from "@/lib/google";
import { getDict } from "@/lib/i18n/dictionaries";
import { saveIonosMailbox, getIonosMailbox, disconnectIonosMailbox, recordIonosResult } from "@/lib/mail/ionos";
import { verifySmtp } from "@/lib/mail/smtp";
import { verifyImap } from "@/lib/mail/imap";
import type { MailSecurity } from "@/lib/mail/socket";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage integrations");
  }
  return session;
}

// The Anthropic API key that powers the Email page's importance screening
// (see src/lib/email-classifier.ts) expires periodically — storing it here
// (encrypted, like every other integration key) instead of only as a
// Cloudflare secret means rotating it is a Settings-page paste, not a
// terminal command each time.
export async function saveAnthropicApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) {
    return { error: t.anthropicKey.keyRequired };
  }

  const encrypted = await encryptSecret(apiKey);

  await withScopedPrismaClient((db) =>
    db.integrationSetting.upsert({
      where: { provider: "anthropic" },
      update: { apiKeyEncrypted: encrypted },
      create: { provider: "anthropic", apiKeyEncrypted: encrypted },
    })
  );

  revalidatePath("/settings");
  return { success: t.anthropicKey.keySaved };
}

export async function saveSystemeIoApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (!apiKey) {
    return { error: t.actions.systemeioKeyRequired };
  }

  const encrypted = await encryptSecret(apiKey);

  await withScopedPrismaClient((db) =>
    db.integrationSetting.upsert({
      where: { provider: "systeme_io" },
      update: { apiKeyEncrypted: encrypted, lastSyncStatus: null, lastSyncError: null },
      create: { provider: "systeme_io", apiKeyEncrypted: encrypted },
    })
  );

  revalidatePath("/settings");
  return { success: t.actions.systemeioKeySaved };
}

export async function triggerSystemeIoSync(): Promise<{
  error?: string;
  success?: string;
  contactsSynced?: number;
  tagsSynced?: number;
  subscriptionsSynced?: number;
  enrollmentsSynced?: number;
  membershipsSynced?: number;
  campaignsSynced?: number;
  automationsSynced?: number;
  bookingsSynced?: number;
}> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  try {
    const result = await runSystemeIoSync();
    revalidatePath("/settings");
    revalidatePath("/contacts");
    revalidatePath("/marketing");
    revalidatePath("/bookings");
    const otherSynced =
      result.subscriptionsSynced + result.enrollmentsSynced + result.membershipsSynced +
      result.campaignsSynced + result.automationsSynced + result.bookingsSynced;
    return {
      success: t.actions.systemeioSynced(result.contactsSynced, result.tagsSynced, otherSynced),
      ...result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : t.actions.systemeioSyncFailed;
    return { error: message };
  }
}

export async function toggleAutoSync(enabled: boolean) {
  await requireAdmin();
  await withScopedPrismaClient((db) =>
    db.integrationSetting.upsert({
      where: { provider: "systeme_io" },
      update: { autoSyncEnabled: enabled },
      create: { provider: "systeme_io", autoSyncEnabled: enabled },
    })
  );
  revalidatePath("/settings");
}

export async function saveAutoSyncTime(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const time = String(formData.get("autoSyncTime") ?? "");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return { error: t.actions.scheduleInvalidTime };
  }

  await withScopedPrismaClient((db) =>
    db.integrationSetting.upsert({
      where: { provider: "systeme_io" },
      update: { autoSyncTime: time },
      create: { provider: "systeme_io", autoSyncTime: time },
    })
  );

  revalidatePath("/settings");
  return { success: t.actions.scheduleSaved };
}

export async function saveShortIoApiKey(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim();
  const domainFr = String(formData.get("domainFr") ?? "").trim();

  if (!apiKey) return { error: t.shortio.keyRequired };
  if (!domain) return { error: t.shortio.domainRequired };

  const encrypted = await encryptSecret(apiKey);
  const metadata = domainFr ? { domain, domainFr } : { domain };

  await withScopedPrismaClient((db) =>
    db.integrationSetting.upsert({
      where: { provider: "shortio" },
      update: { apiKeyEncrypted: encrypted, metadata },
      create: { provider: "shortio", apiKeyEncrypted: encrypted, metadata },
    })
  );

  revalidatePath("/settings");
  return { success: t.shortio.keySaved };
}

// Google is a personal, per-user connection (unlike the org-wide
// integrations above), so any signed-in user can disconnect their own —
// no admin check.
export async function disconnectGoogleAccount(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
  await disconnectGoogle(session.user.id);
  revalidatePath("/settings");
  revalidatePath("/");
}

// The IONOS mailbox is a personal, per-user connection too (see
// IonosMailboxAccount's comment in schema.prisma) — same no-admin-check
// pattern as Google above.
export async function saveIonosMailboxAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const address = String(formData.get("address") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim() || null;
  const imapHost = String(formData.get("imapHost") ?? "").trim();
  const imapPort = Number(formData.get("imapPort") ?? 993);
  const imapSecurity = String(formData.get("imapSecurity") ?? "tls") as MailSecurity;
  const smtpHost = String(formData.get("smtpHost") ?? "").trim();
  const smtpPort = Number(formData.get("smtpPort") ?? 465);
  const smtpSecurity = String(formData.get("smtpSecurity") ?? "tls") as MailSecurity;
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!address) return { error: t.ionosMailbox.addressRequired };
  if (!imapHost || !smtpHost || !username) return { error: t.ionosMailbox.hostRequired };

  try {
    await withScopedPrismaClient((db) =>
      saveIonosMailbox(
        session.user.id,
        { address, displayName, credentials: { imapHost, imapPort, imapSecurity, smtpHost, smtpPort, smtpSecurity, username, password } },
        db
      )
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/settings");
  return { success: t.ionosMailbox.saved };
}

// Logs into both SMTP and IMAP — lets a bad host/port/credential surface
// right away from Settings instead of only being discovered on the first
// real send or inbox refresh, since protocol failures are otherwise
// invisible. Both are checked even though only one might be wrong, since
// IONOS's SMTP/IMAP frontends have shown inconsistent auth behavior
// before (see the AUTH PLAIN/LOGIN fallback in smtp.ts) — better to know
// up front than have sending work while refreshing quietly fails, or the
// reverse.
export async function testIonosMailboxAction(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const imapHost = String(formData.get("imapHost") ?? "").trim();
  const imapPort = Number(formData.get("imapPort") ?? 993);
  const imapSecurity = String(formData.get("imapSecurity") ?? "tls") as MailSecurity;
  const smtpHost = String(formData.get("smtpHost") ?? "").trim();
  const smtpPort = Number(formData.get("smtpPort") ?? 465);
  const smtpSecurity = String(formData.get("smtpSecurity") ?? "tls") as MailSecurity;
  const username = String(formData.get("username") ?? "").trim();
  const formPassword = String(formData.get("password") ?? "");

  return withScopedPrismaClient(async (db) => {
    const existing = await getIonosMailbox(session.user.id, db);
    const password = formPassword || existing?.credentials.password;
    if (!smtpHost || !imapHost || !username || !password) return { error: t.ionosMailbox.hostRequired };

    try {
      await verifySmtp({ host: smtpHost, port: smtpPort, security: smtpSecurity, username, password });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await recordIonosResult(session.user.id, db, `SMTP: ${message}`);
      return { error: message };
    }
    try {
      await verifyImap({ host: imapHost, port: imapPort, security: imapSecurity, username, password });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await recordIonosResult(session.user.id, db, `IMAP: ${message}`);
      return { error: message };
    }
    await recordIonosResult(session.user.id, db, null);
    return { success: t.ionosMailbox.testOk };
  });
}

export async function disconnectIonosMailboxAction(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not signed in");
  await withScopedPrismaClient((db) => disconnectIonosMailbox(session.user.id, db));
  revalidatePath("/settings");
}
