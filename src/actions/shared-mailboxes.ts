"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";
import { verifyImap, listRecentImapMessages, fetchImapMessageRaw } from "@/lib/mail/imap";
import { getRecentEmails, fetchGmailMessageRaw, sendGmailMessage } from "@/lib/google";
import { verifySmtp, sendViaSmtp } from "@/lib/mail/smtp";
import { parseMessage, extractAttachmentBytes, encodeBase64, type AttachmentMeta } from "@/lib/mail/mime-parse";
import { buildMimeMessage } from "@/lib/mail/mime-build";
import type { MailSecurity } from "@/lib/mail/socket";
import { loadMailbox, getMailboxAccessToken, loadCredentials, imapOf, smtpOf, encryptCredentials, mailboxLevel, type SharedCredentials } from "@/lib/mail/shared-mailbox";
import { mailboxAtLeast, type MailboxLevel } from "@/lib/mail/shared-levels";

type FormState = { error?: string; success?: string; id?: string } | undefined;

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") throw new Error("Only admins can manage shared mailboxes");
  return session;
}

function readForm(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    id: s("id"),
    name: s("name"),
    address: s("address").toLowerCase(),
    displayName: s("displayName") || null,
    provider: s("provider") || "imap",
    imapHost: s("imapHost"),
    imapPort: Number(s("imapPort") || 993),
    imapSecurity: (s("imapSecurity") || "tls") as MailSecurity,
    smtpHost: s("smtpHost"),
    smtpPort: Number(s("smtpPort") || 465),
    smtpSecurity: (s("smtpSecurity") || "tls") as MailSecurity,
    username: s("username"),
    password: String(formData.get("password") ?? ""),
  };
}

async function credentialsFromForm(db: Parameters<typeof loadCredentials>[0], f: ReturnType<typeof readForm>): Promise<SharedCredentials | { error: string }> {
  const existing = f.id ? await loadCredentials(db, f.id) : null;
  const password = f.password || existing?.creds.password;
  if (!password) return { error: "A password (or app password) is required." };
  if (!f.imapHost || !f.smtpHost || !(f.username || f.address)) return { error: "IMAP host, SMTP host and username are required." };
  return {
    imapHost: f.imapHost, imapPort: f.imapPort, imapSecurity: f.imapSecurity,
    smtpHost: f.smtpHost, smtpPort: f.smtpPort, smtpSecurity: f.smtpSecurity,
    username: f.username || f.address, password,
  };
}

export async function saveSharedMailboxAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess("settings", "WRITE");
  await requireAdmin();
  const f = readForm(formData);
  if (!f.name || !f.address) return { error: "Name and email address are required." };
  const result = await withScopedPrismaClient(async (db) => {
    if (f.provider === "google-oauth") {
      // "Connect with Google": only the label details are saved here; the sign-in itself happens at /api/google/shared/connect.
      const existing = f.id ? await db.sharedMailbox.findUnique({ where: { id: f.id } }) : null;
      if (existing) {
        await db.sharedMailbox.update({ where: { id: f.id }, data: { name: f.name, address: f.address, displayName: f.displayName, provider: "google-oauth" } });
        return { success: "Saved.", id: f.id };
      }
      const created = await db.sharedMailbox.create({ data: { name: f.name, address: f.address, displayName: f.displayName, provider: "google-oauth", credentialsEncrypted: await encryptCredentials({} as SharedCredentials) } });
      return { success: "Saved. Now click “Connect with Google”.", id: created.id };
    }
    const creds = await credentialsFromForm(db, f);
    if ("error" in creds) return creds;
    const credentialsEncrypted = await encryptCredentials(creds);
    const data = { name: f.name, address: f.address, displayName: f.displayName, provider: f.provider, credentialsEncrypted };
    if (f.id) await db.sharedMailbox.update({ where: { id: f.id }, data });
    else await db.sharedMailbox.create({ data });
    return { success: "Saved." };
  });
  revalidatePath("/settings");
  return result;
}

export async function testSharedMailboxAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAccess("settings", "WRITE");
  await requireAdmin();
  const f = readForm(formData);
  const creds = await withScopedPrismaClient((db) => credentialsFromForm(db, f));
  if ("error" in creds) return creds;
  try {
    await verifyImap(imapOf(creds));
  } catch (e) {
    return { error: `IMAP: ${e instanceof Error ? e.message : String(e)}` };
  }
  try {
    await verifySmtp(smtpOf(creds));
  } catch (e) {
    return { error: `SMTP: ${e instanceof Error ? e.message : String(e)}` };
  }
  return { success: "Connection works (IMAP and SMTP)." };
}

export async function deleteSharedMailboxAction(id: string): Promise<void> {
  await requireAccess("settings", "DELETE");
  await requireAdmin();
  await withScopedPrismaClient((db) => db.sharedMailbox.deleteMany({ where: { id } }));
  revalidatePath("/settings");
}

// ---- Team members ----

export interface MyMailbox { id: string; name: string; address: string; level: MailboxLevel }

export async function listMyMailboxesAction(): Promise<MyMailbox[]> {
  await requireAccess("email", "READ");
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return withScopedPrismaClient(async (db) => {
    if (session.user.role === "ADMIN") {
      return (await db.sharedMailbox.findMany({ orderBy: { name: "asc" } })).map((m) => ({ id: m.id, name: m.name, address: m.address, level: "COMPLETE" as MailboxLevel }));
    }
    const rows = await db.sharedMailboxAccess.findMany({ where: { userId: session.user.id }, include: { mailbox: true } });
    return rows
      .filter((r) => r.level !== "NONE")
      .map((r) => ({ id: r.mailboxId, name: r.mailbox.name, address: r.mailbox.address, level: r.level as MailboxLevel }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

async function guard(mailboxId: string, need: MailboxLevel) {
  await requireAccess("email", need === "READ" ? "READ" : "WRITE");
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const level = await withScopedPrismaClient((db) => mailboxLevel(db, session.user, mailboxId));
  if (!mailboxAtLeast(level, need)) {
    throw new Error(need === "READ" ? "You do not have access to this mailbox." : need === "SEND" ? "You have read-only access to this mailbox." : "You may not mark messages complete in this mailbox.");
  }
  return session;
}

export interface SharedMessage {
  key: string; // IMAP uid, or Gmail message id
  seen: boolean;
  from: { name: string; email: string };
  subject: string;
  date: string | null;
  hasAttachments: boolean;
  completed: boolean;
}

export async function listSharedMessagesAction(mailboxId: string): Promise<{ messages: SharedMessage[] } | { error: string }> {
  await guard(mailboxId, "READ");
  return withScopedPrismaClient(async (db) => {
    const box = await loadMailbox(db, mailboxId);
    if (!box) return { error: "Mailbox not found." };
    try {
      let rows: Omit<SharedMessage, "completed">[];
      if (box.kind === "google") {
        const token = await getMailboxAccessToken(db, mailboxId);
        if (!token) throw new Error("Google is not connected for this mailbox (or access was revoked). An admin must reconnect it in Settings.");
        const list = await getRecentEmails(token, { maxResults: 60, unreadOnly: false });
        if (!list) throw new Error("Gmail could not be read for this mailbox.");
        rows = list.map((m) => ({ key: m.id, seen: true, from: { name: m.from, email: m.fromEmail }, subject: m.subject, date: m.date, hasAttachments: m.hasAttachments }));
      } else {
        const list = await listRecentImapMessages(imapOf(box.creds), 60);
        rows = list.map((m) => ({ key: String(m.uid), seen: m.seen, from: m.from, subject: m.subject, date: m.date ?? m.internalDate, hasAttachments: m.hasAttachments }));
      }
      const done = new Set((await db.sharedMailboxCompletion.findMany({ where: { mailboxId, messageKey: { in: rows.map((m) => m.key) } }, select: { messageKey: true } })).map((c) => c.messageKey));
      await db.sharedMailbox.update({ where: { id: mailboxId }, data: { lastCheckedAt: new Date(), lastError: null } });
      return { messages: rows.map((m) => ({ ...m, completed: done.has(m.key) })) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.sharedMailbox.update({ where: { id: mailboxId }, data: { lastCheckedAt: new Date(), lastError: message } });
      return { error: message };
    }
  });
}

export interface SharedDetail {
  key: string;
  threadId: string | null;
  subject: string;
  from: { name: string; email: string };
  to: string[];
  cc: string[];
  date: string | null;
  html: string | null;
  text: string | null;
  attachments: AttachmentMeta[];
  messageIdHeader: string | null;
  references: string[];
}

// The full raw message, from Gmail's API or the IMAP server, whichever the mailbox uses.
async function fetchRaw(db: Parameters<typeof loadMailbox>[0], mailboxId: string, key: string): Promise<{ raw: string; threadId: string | null } | { error: string }> {
  const box = await loadMailbox(db, mailboxId);
  if (!box) return { error: "Mailbox not found." };
  if (box.kind === "google") {
    const token = await getMailboxAccessToken(db, mailboxId);
    if (!token) return { error: "Google is not connected for this mailbox." };
    const r = await fetchGmailMessageRaw(token, key);
    return r ? { raw: r.raw, threadId: r.threadId } : { error: "Message not found." };
  }
  const uid = Number(key);
  if (!Number.isFinite(uid)) return { error: "Message not found." };
  const raw = await fetchImapMessageRaw(imapOf(box.creds), uid);
  return raw ? { raw, threadId: null } : { error: "Message not found." };
}

export async function fetchSharedMessageAction(mailboxId: string, key: string): Promise<SharedDetail | { error: string }> {
  await guard(mailboxId, "READ");
  return withScopedPrismaClient(async (db) => {
    try {
      const r = await fetchRaw(db, mailboxId, key);
      if ("error" in r) return r;
      const p = parseMessage(r.raw);
      return { key, threadId: r.threadId, subject: p.subject, from: p.from, to: p.to.map((a) => a.email), cc: p.cc.map((a) => a.email), date: p.date, html: p.html, text: p.text, attachments: p.attachments, messageIdHeader: p.messageId, references: p.references };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export async function downloadSharedAttachmentAction(mailboxId: string, key: string, index: number): Promise<{ filename: string; mimeType: string; base64: string } | { error: string }> {
  await guard(mailboxId, "READ");
  return withScopedPrismaClient(async (db) => {
    const r = await fetchRaw(db, mailboxId, key);
    if ("error" in r) return r;
    const a = extractAttachmentBytes(r.raw, index);
    return a ? { filename: a.filename, mimeType: a.mimeType, base64: encodeBase64(a.bytes) } : { error: "Attachment not found." };
  });
}

export interface SharedSendInput {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  inReplyTo: string | null;
  references: string[];
  threadId: string | null;
}

export async function sendSharedMessageAction(mailboxId: string, input: SharedSendInput): Promise<{ error: string } | { success: true }> {
  await guard(mailboxId, "SEND");
  if (input.to.length === 0) return { error: "Add at least one recipient." };
  return withScopedPrismaClient(async (db) => {
    const box = await loadMailbox(db, mailboxId);
    if (!box) return { error: "Mailbox not found." };
    const { raw } = buildMimeMessage({
      fromName: box.displayName,
      fromEmail: box.address,
      to: input.to,
      cc: input.cc,
      bcc: [],
      subject: input.subject,
      html: input.html,
      inReplyTo: input.inReplyTo,
      references: input.references,
      includeBccHeader: box.kind === "google",
    });
    try {
      if (box.kind === "google") {
        const token = await getMailboxAccessToken(db, mailboxId);
        if (!token) return { error: "Google is not connected for this mailbox." };
        const r = await sendGmailMessage(token, raw, input.threadId ?? undefined);
        if ("error" in r) return { error: r.error };
      } else {
        await sendViaSmtp(smtpOf(box.creds), { from: box.address, to: input.to, cc: input.cc, bcc: [], raw });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.sharedMailbox.update({ where: { id: mailboxId }, data: { lastError: message } });
      return { error: message };
    }
    return { success: true };
  });
}

export async function setSharedCompleteAction(mailboxId: string, key: string, done: boolean): Promise<void> {
  const session = await guard(mailboxId, "COMPLETE");
  await withScopedPrismaClient(async (db) => {
    if (done) {
      await db.sharedMailboxCompletion.upsert({
        where: { mailboxId_messageKey: { mailboxId, messageKey: key } },
        update: {},
        create: { mailboxId, messageKey: key, completedBy: session.user.id },
      });
    } else {
      await db.sharedMailboxCompletion.deleteMany({ where: { mailboxId, messageKey: key } });
    }
  });
}

/** Admin: set who may use one mailbox (userId -> level). Same data as the per-person list in Team access. */
export async function setMailboxAccessAction(mailboxId: string, levels: Record<string, string>): Promise<{ error?: string; success?: string }> {
  await requireAccess("settings", "WRITE");
  await requireAdmin();
  await withScopedPrismaClient(async (db) => {
    const users = new Set((await db.user.findMany({ where: { role: "MEMBER" }, select: { id: true } })).map((u) => u.id));
    await db.sharedMailboxAccess.deleteMany({ where: { mailboxId } });
    const rows = Object.entries(levels).filter(([id, l]) => users.has(id) && ["READ", "SEND", "COMPLETE"].includes(l));
    if (rows.length) await db.sharedMailboxAccess.createMany({ data: rows.map(([userId, level]) => ({ mailboxId, userId, level })) });
  });
  revalidatePath("/settings");
  revalidatePath("/email/shared");
  return { success: "Access saved." };
}
