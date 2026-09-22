// The one RFC 5322/2045 message builder used by every outgoing mail path
// this app has — Gmail's `messages.send` (raw, base64url-wrapped) and the
// IONOS SMTP client's `DATA` command both send exactly the same wire
// format, so there is exactly one place that assembles it.

import type { ParsedMessage } from "./mime-parse";

export interface OutgoingAttachment {
  filename: string;
  mimeType: string;
  base64: string; // already base64-encoded by the client (see email-compose-dialog.tsx's file picker)
}

export interface OutgoingMessage {
  fromName: string | null;
  fromEmail: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string;
  inReplyTo?: string | null; // Message-ID of the message being replied to
  references?: string[];
  messageIdDomain?: string; // domain used to generate a fresh Message-ID, e.g. "andrewmurphy.online"
  attachments?: OutgoingAttachment[];
}

function base64ToBinary(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// 76-char lines per RFC 2045 §6.8 — most mail servers reject (or badly
// mangle) a base64 body sent as one unbroken line.
export function chunkBase64(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join("\r\n");
}

function encodeUtf8ToBase64(text: string): string {
  return base64ToBinary(new TextEncoder().encode(text));
}

// RFC 2047 B-encoding — needed for any header value (subject, display
// name) containing non-ASCII text, which French subjects/names always
// will.
export function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${encodeUtf8ToBase64(value)}?=`;
}

export function formatAddress(name: string | null, email: string): string {
  if (!name) return `<${email}>`;
  const needsQuoting = /[",<>@]/.test(name);
  const safeName = needsQuoting ? `"${name.replace(/"/g, '\\"')}"` : name;
  const isAscii = /^[\x00-\x7F]*$/.test(safeName);
  return `${isAscii ? safeName : encodeHeaderValue(name)} <${email}>`;
}

function generateMessageId(domain: string): string {
  const random = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `<${random}@${domain}>`;
}

// A crude but adequate HTML→plain-text fallback (the multipart/
// alternative "plain" leg) — strips tags and unescapes the handful of
// entities RichTextarea's output actually produces.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Wraps a previous message's text as a ">"-quoted block, and its HTML as
// a left-bordered blockquote — for the compose dialog's reply/forward
// body, prefilled above this.
export function buildQuotedReply(
  original: Pick<ParsedMessage, "from" | "date" | "html" | "text">,
  mode: "reply" | "forward",
  quotedHeaderText: string // pre-formatted "On {date}, {sender} wrote:" (or forward equivalent), built by the caller so this stays locale-agnostic
): { html: string } {
  const senderLabel = original.from.name ? `${original.from.name} &lt;${original.from.email}&gt;` : original.from.email;
  const body = original.html ?? (original.text ? `<pre style="white-space:pre-wrap">${escapeHtml(original.text)}</pre>` : "");
  const header = mode === "forward" ? quotedHeaderText.replace("{sender}", senderLabel) : quotedHeaderText.replace("{sender}", senderLabel);
  return {
    html: `<p></p><p style="color:#6b7280;font-size:13px">${header}</p><blockquote style="margin:0;padding-left:12px;border-left:3px solid #d1d5db;color:#374151">${body}</blockquote>`,
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Assembles the full RFC 5322 message: multipart/alternative with a
// plain-text leg (derived from the HTML) and the HTML leg itself, both
// base64-encoded, CRLF line endings throughout.
export function buildMimeMessage(msg: OutgoingMessage): { raw: string; messageId: string } {
  const messageId = generateMessageId(msg.messageIdDomain ?? "andrewmurphy.online");
  const boundary = `----=_Part_${Math.random().toString(36).slice(2)}`;
  const text = htmlToPlainText(msg.html);

  const headers: string[] = [
    `From: ${formatAddress(msg.fromName, msg.fromEmail)}`,
    `To: ${msg.to.map((a) => `<${a}>`).join(", ")}`,
  ];
  if (msg.cc.length > 0) headers.push(`Cc: ${msg.cc.map((a) => `<${a}>`).join(", ")}`);
  if (msg.bcc.length > 0) headers.push(`Bcc: ${msg.bcc.map((a) => `<${a}>`).join(", ")}`);
  headers.push(`Subject: ${encodeHeaderValue(msg.subject)}`);
  headers.push(`Date: ${new Date().toUTCString().replace("GMT", "+0000")}`);
  headers.push(`Message-ID: ${messageId}`);
  if (msg.inReplyTo) headers.push(`In-Reply-To: ${msg.inReplyTo}`);
  if (msg.references && msg.references.length > 0) headers.push(`References: ${msg.references.join(" ")}`);
  headers.push("MIME-Version: 1.0");
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  const textPart = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(encodeUtf8ToBase64(text)),
  ].join("\r\n");

  const htmlPart = [
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    chunkBase64(encodeUtf8ToBase64(msg.html)),
  ].join("\r\n");

  const alternativeBody = [textPart, htmlPart, `--${boundary}--`].join("\r\n");

  const attachments = msg.attachments ?? [];
  if (attachments.length === 0) {
    const raw = [headers.join("\r\n"), "", alternativeBody, ""].join("\r\n");
    return { raw, messageId };
  }

  // With attachments, the multipart/alternative body built above becomes
  // one part inside an outer multipart/mixed — the top-level Content-Type
  // header set earlier is replaced with the mixed one, and that
  // alternative part gets its own nested boundary line reusing the same
  // headers/body already assembled.
  const mixedBoundary = `----=_Mixed_${Math.random().toString(36).slice(2)}`;
  headers[headers.length - 1] = `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`;

  const alternativePart = [`--${mixedBoundary}`, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", alternativeBody].join(
    "\r\n"
  );

  const attachmentParts = attachments.map((a) => {
    // Content-Disposition's filename param is only formally allowed
    // RFC 2231 encoding for non-ASCII, not RFC 2047 — but most clients
    // tolerate the latter, and a plain quoted name covers the common case.
    const isAscii = /^[\x00-\x7F]*$/.test(a.filename);
    const safeName = a.filename.replace(/"/g, "");
    const filenameParam = isAscii ? `"${safeName}"` : `"${encodeHeaderValue(a.filename)}"`;
    return [
      `--${mixedBoundary}`,
      `Content-Type: ${a.mimeType || "application/octet-stream"}; name=${filenameParam}`,
      `Content-Disposition: attachment; filename=${filenameParam}`,
      "Content-Transfer-Encoding: base64",
      "",
      chunkBase64(a.base64.replace(/[\r\n\s]/g, "")),
    ].join("\r\n");
  });

  const raw = [headers.join("\r\n"), "", alternativePart, ...attachmentParts, `--${mixedBoundary}--`, ""].join("\r\n");
  return { raw, messageId };
}
