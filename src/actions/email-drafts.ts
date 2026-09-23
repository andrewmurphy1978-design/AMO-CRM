"use server";

import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken, getGoogleConnection, getDrafts, fetchGmailDraftRaw, deleteGmailDraft, sendGmailMessage, createGmailDraft } from "@/lib/google";
import { getIonosMailbox } from "@/lib/mail/ionos";
import { listDraftMessages, fetchImapMessageRaw, deleteImapMessage, appendImapMessage } from "@/lib/mail/imap";
import { parseMessage } from "@/lib/mail/mime-parse";
import { buildMimeMessage } from "@/lib/mail/mime-build";
import { sendViaSmtp } from "@/lib/mail/smtp";
import { loadIdentities } from "./email-messages";
import type { MailSource } from "@/lib/mail/identity";

export type DraftSource = "gmail" | "ionos";

export interface DraftRow {
  id: string; // "ionos-draft:<uid>" for an IONOS draft, the bare Gmail draft id otherwise
  source: DraftSource;
  to: string;
  subject: string;
  snippet: string;
  date: string; // ISO
  link: string;
}

// "ionos-draft:<uid>" — distinct from a received message's "ionos:<uid>"
// and a sent record's "ionos-sent:<id>" (see those ids' own comments),
// so all three id spaces stay disjoint.
function ionosDraftRowId(uid: number): string {
  return `ionos-draft:${uid}`;
}

function parseIonosDraftUid(id: string): number | null {
  if (!id.startsWith("ionos-draft:")) return null;
  const uid = Number(id.slice("ionos-draft:".length));
  return Number.isFinite(uid) ? uid : null;
}

// The Email page's "Drafts waiting for your approval" section — every
// saved-but-unsent draft across both mail sources this account has,
// merged into one list. Sequential (not Promise.all) DB reads for the
// same reason every other action in this codebase does that — concurrent
// Prisma reads sharing one Hyperdrive connection is what trips Cloudflare's
// Error 1102.
export async function fetchDraftsAction(): Promise<DraftRow[]> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    const mailbox = await getIonosMailbox(session.user.id, db);

    const gmailDrafts = accessToken ? ((await getDrafts(accessToken)) ?? []) : [];
    const gmailRows: DraftRow[] = gmailDrafts.map((d) => ({
      id: d.id,
      source: "gmail",
      to: d.to,
      subject: d.subject,
      snippet: d.snippet,
      date: d.date,
      link: d.link,
    }));

    let ionosRows: DraftRow[] = [];
    if (mailbox) {
      const messages = await listDraftMessages(
        {
          host: mailbox.credentials.imapHost,
          port: mailbox.credentials.imapPort,
          security: mailbox.credentials.imapSecurity,
          username: mailbox.credentials.username,
          password: mailbox.credentials.password,
        },
        20
      );
      ionosRows = messages.map((m) => ({
        id: ionosDraftRowId(m.uid),
        source: "ionos",
        to: m.to.join(", "),
        subject: m.subject,
        snippet: "",
        date: m.date ?? m.internalDate ?? new Date().toISOString(),
        link: "https://mail.ionos.com/",
      }));
    }

    return [...gmailRows, ...ionosRows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });
}

export interface DraftDetail {
  id: string;
  source: DraftSource;
  threadId: string;
  subject: string;
  to: string[];
  cc: string[];
  html: string | null;
  text: string | null;
  // The address this draft will send from once approved — the compose
  // dialog's "From" display and its address-color match both key off
  // this, resolved server-side since a draft's own account is never
  // ambiguous the way a reply's is.
  fromAddress: string;
}

// The Drafts section's "open to review" call — fetches the draft's full
// raw MIME (whichever source the id names) and parses it with the same
// mime-parse.ts parser every other message-fetch path in this app uses.
export async function fetchDraftDetailAction(id: string): Promise<DraftDetail | { error: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  return withScopedPrismaClient(async (db) => {
    const ionosUid = parseIonosDraftUid(id);
    if (ionosUid !== null) {
      const mailbox = await getIonosMailbox(session.user.id, db);
      if (!mailbox) return { error: "not_connected" };
      const raw = await fetchImapMessageRaw(
        {
          host: mailbox.credentials.imapHost,
          port: mailbox.credentials.imapPort,
          security: mailbox.credentials.imapSecurity,
          username: mailbox.credentials.username,
          password: mailbox.credentials.password,
        },
        ionosUid,
        "Drafts"
      );
      if (!raw) return { error: "not_found" };
      const parsed = parseMessage(raw);
      return {
        id,
        source: "ionos",
        threadId: id,
        subject: parsed.subject,
        to: parsed.to.map((a) => a.email),
        cc: parsed.cc.map((a) => a.email),
        html: parsed.html,
        text: parsed.text,
        fromAddress: mailbox.address,
      };
    }

    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };
    const draft = await fetchGmailDraftRaw(accessToken, id);
    if (!draft) return { error: "not_found" };
    const google = await getGoogleConnection(session.user.id, db);
    const parsed = parseMessage(draft.raw);
    return {
      id,
      source: "gmail",
      threadId: draft.threadId,
      subject: parsed.subject,
      to: parsed.to.map((a) => a.email),
      cc: parsed.cc.map((a) => a.email),
      html: parsed.html,
      text: parsed.text,
      fromAddress: google?.email ?? "",
    };
  });
}

export interface SendDraftInput {
  to: string[];
  cc: string[];
  subject: string;
  html: string;
  attachments: { filename: string; mimeType: string; base64: string }[];
}

// Sends a reviewed draft and removes it from its source's Drafts folder —
// a draft's own identity is never in question the way a reply's is (it's
// already sitting in one specific account's Drafts folder), so this sends
// directly over that account's own transport rather than going through
// sendEmailAction's header-based identity guess.
export async function sendDraftAction(id: string, source: DraftSource, input: SendDraftInput): Promise<{ error: string } | { success: true }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  if (input.to.length === 0) return { error: "recipient_required" };

  return withScopedPrismaClient(async (db) => {
    if (source === "ionos") {
      const mailbox = await getIonosMailbox(session.user.id, db);
      if (!mailbox) return { error: "not_connected" };
      const { raw } = buildMimeMessage({
        fromName: mailbox.displayName,
        fromEmail: mailbox.address,
        to: input.to,
        cc: input.cc,
        bcc: [],
        subject: input.subject,
        html: input.html,
        attachments: input.attachments,
      });
      try {
        await sendViaSmtp(
          {
            host: mailbox.credentials.smtpHost,
            port: mailbox.credentials.smtpPort,
            security: mailbox.credentials.smtpSecurity,
            username: mailbox.credentials.username,
            password: mailbox.credentials.password,
          },
          { from: mailbox.address, to: input.to, cc: input.cc, bcc: [], raw }
        );
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
      const uid = parseIonosDraftUid(id);
      if (uid !== null) {
        await deleteImapMessage(
          {
            host: mailbox.credentials.imapHost,
            port: mailbox.credentials.imapPort,
            security: mailbox.credentials.imapSecurity,
            username: mailbox.credentials.username,
            password: mailbox.credentials.password,
          },
          uid,
          "Drafts"
        ).catch(() => {});
      }
      return { success: true };
    }

    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };
    const google = await getGoogleConnection(session.user.id, db);
    if (!google?.email) return { error: "not_connected" };
    const { raw } = buildMimeMessage({
      fromName: null,
      fromEmail: google.email,
      to: input.to,
      cc: input.cc,
      bcc: [],
      subject: input.subject,
      html: input.html,
      attachments: input.attachments,
    });
    const result = await sendGmailMessage(accessToken, raw);
    if ("error" in result) return { error: result.error };
    await deleteGmailDraft(accessToken, id).catch(() => false);
    return { success: true };
  });
}

// Deletes a draft without sending it — the Discard action.
export async function discardDraftAction(id: string, source: DraftSource): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient(async (db) => {
    if (source === "ionos") {
      const uid = parseIonosDraftUid(id);
      if (uid === null) return;
      const mailbox = await getIonosMailbox(session.user.id, db);
      if (!mailbox) return;
      await deleteImapMessage(
        {
          host: mailbox.credentials.imapHost,
          port: mailbox.credentials.imapPort,
          security: mailbox.credentials.imapSecurity,
          username: mailbox.credentials.username,
          password: mailbox.credentials.password,
        },
        uid,
        "Drafts"
      );
      return;
    }
    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return;
    await deleteGmailDraft(accessToken, id);
  });
}

export interface CreateDraftInput {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  attachments: { filename: string; mimeType: string; base64: string }[];
  // Which identity to save the draft under — required (unlike
  // sendEmailAction's fromOverride) since a fresh compose has no original
  // message to resolve a default from; the compose dialog always sends
  // whichever identity its own From field currently shows. Still
  // validated against the user's real identities, never trusted outright.
  from: { source: MailSource; accountAddress: string };
  inReplyToId?: string | null;
  threadId?: string | null;
  messageIdHeader?: string | null;
  references?: string[];
}

// The Compose dialog's "Save as draft" for a brand-new/reply/forward
// message being composed (as opposed to sendDraftAction, which approves
// an *existing* Drafts-folder row) — builds the same MIME every send path
// does and files it as a draft on whichever identity was chosen.
export async function createDraftAction(input: CreateDraftInput): Promise<{ error: string } | { success: true }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  // Unlike sendEmailAction, a draft is allowed to have no recipient yet —
  // "save it and add the To address later" is normal draft usage in every
  // mail client, so this only validates the from identity below.

  return withScopedPrismaClient(async (db) => {
    const identities = await loadIdentities(session.user.id, db);
    const identity = identities.find(
      (id) => id.source === input.from.source && id.accountAddress.toLowerCase() === input.from.accountAddress.toLowerCase()
    );
    if (!identity) return { error: "not_connected" };

    const { raw } = buildMimeMessage({
      fromName: identity.displayName,
      fromEmail: identity.accountAddress,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      html: input.html,
      inReplyTo: input.messageIdHeader ?? null,
      references: input.references ?? [],
      attachments: input.attachments,
      includeBccHeader: identity.source === "gmail",
    });

    if (identity.source === "ionos") {
      const mailbox = await getIonosMailbox(session.user.id, db);
      if (!mailbox) return { error: "not_connected" };
      try {
        await appendImapMessage(
          {
            host: mailbox.credentials.imapHost,
            port: mailbox.credentials.imapPort,
            security: mailbox.credentials.imapSecurity,
            username: mailbox.credentials.username,
            password: mailbox.credentials.password,
          },
          "Drafts",
          raw
        );
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
      return { success: true };
    }

    const accessToken = await getValidAccessToken(session.user.id, db);
    if (!accessToken) return { error: "not_connected" };
    const result = await createGmailDraft(accessToken, raw, input.threadId ?? undefined);
    if ("error" in result) return { error: result.error };
    return { success: true };
  });
}
