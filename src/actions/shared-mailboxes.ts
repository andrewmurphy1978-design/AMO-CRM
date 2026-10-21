"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";
import { verifyImap, listRecentImapMessages, fetchImapMessageRaw, type ImapMessageSummary } from "@/lib/mail/imap";
import { verifySmtp, sendViaSmtp } from "@/lib/mail/smtp";
import { parseMessage, extractAttachmentBytes, encodeBase64, type AttachmentMeta } from "@/lib/mail/mime-parse";
import { buildMimeMessage } from "@/lib/mail/mime-build";
import type { MailSecurity } from "@/lib/mail/socket";
import { loadCredentials, imapOf, smtpOf, encryptCredentials, mailboxLevel, type SharedCredentials } from "@/lib/mail/shared-mailbox";
import { mailboxAtLeast, type MailboxLevel } from "@/lib/mail/shared-levels";

type FormState = { error?: string; success?: string } | undefined;

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

export type SharedMessage = Pick<ImapMessageSummary, "uid" | "seen" | "from" | "to" | "subject" | "date" | "internalDate" | "hasAttachments"> & { completed: boolean };

export async function listSharedMessagesAction(mailboxId: string): Promise<{ messages: SharedMessage[] } | { error: string }> {
  await guard(mailboxId, "READ");
  return withScopedPrismaClient(async (db) => {
    const box = await loadCredentials(db, mailboxId);
    if (!box) return { error: "Mailbox not found." };
    try {
      const list = await listRecentImapMessages(imapOf(box.creds), 60);
      const done = new Set((await db.sharedMailboxCompletion.findMany({ where: { mailboxId, uid: { in: list.map((m) => m.uid) } }, select: { uid: true } })).map((c) => c.uid));
      await db.sharedMailbox.update({ where: { id: mailboxId }, data: { lastCheckedAt: new Date(), lastError: null } });
      return {
        messages: list.map((m) => ({ uid: m.uid, seen: m.seen, from: m.from, to: m.to, subject: m.subject, date: m.date, internalDate: m.internalDate, hasAttachments: m.hasAttachments, completed: done.has(m.uid) })),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.sharedMailbox.update({ where: { id: mailboxId }, data: { lastCheckedAt: new Date(), lastError: message } });
      return { error: message };
    }
  });
}

export interface SharedDetail {
  uid: number;
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

export async function fetchSharedMessageAction(mailboxId: string, uid: number): Promise<SharedDetail | { error: string }> {
  await guard(mailboxId, "READ");
  return withScopedPrismaClient(async (db) => {
    const box = await loadCredentials(db, mailboxId);
    if (!box) return { error: "Mailbox not found." };
    try {
      const raw = await fetchImapMessageRaw(imapOf(box.creds), uid);
      if (!raw) return { error: "Message not found." };
      const p = parseMessage(raw);
      return { uid, subject: p.subject, from: p.from, to: p.to.map((a) => a.email), cc: p.cc.map((a) => a.email), date: p.date, html: p.html, text: p.text, attachments: p.attachments, messageIdHeader: p.messageId, references: p.references };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
}

export async function downloadSharedAttachmentAction(mailboxId: string, uid: number, index: number): Promise<{ filename: string; mimeType: string; base64: string } | { error: string }> {
  await guard(mailboxId, "READ");
  return withScopedPrismaClient(async (db) => {
    const box = await loadCredentials(db, mailboxId);
    if (!box) return { error: "Mailbox not found." };
    const raw = await fetchImapMessageRaw(imapOf(box.creds), uid);
    if (!raw) return { error: "Message not found." };
    const a = extractAttachmentBytes(raw, index);
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
}

export async function sendSharedMessageAction(mailboxId: string, input: SharedSendInput): Promise<{ error: string } | { success: true }> {
  await guard(mailboxId, "SEND");
  if (input.to.length === 0) return { error: "Add at least one recipient." };
  return withScopedPrismaClient(async (db) => {
    const box = await loadCredentials(db, mailboxId);
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
      includeBccHeader: false,
    });
    try {
      await sendViaSmtp(smtpOf(box.creds), { from: box.address, to: input.to, cc: input.cc, bcc: [], raw });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db.sharedMailbox.update({ where: { id: mailboxId }, data: { lastError: message } });
      return { error: message };
    }
    return { success: true };
  });
}

export async function setSharedCompleteAction(mailboxId: string, uid: number, done: boolean): Promise<void> {
  const session = await guard(mailboxId, "COMPLETE");
  await withScopedPrismaClient(async (db) => {
    if (done) {
      await db.sharedMailboxCompletion.upsert({
        where: { mailboxId_uid: { mailboxId, uid } },
        update: {},
        create: { mailboxId, uid, completedBy: session.user.id },
      });
    } else {
      await db.sharedMailboxCompletion.deleteMany({ where: { mailboxId, uid } });
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
