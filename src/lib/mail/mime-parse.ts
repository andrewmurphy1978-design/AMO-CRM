// Dependency-free RFC 5322 (message format) + RFC 2045/2046/2047 (MIME)
// parser, shared by every mail source this app reads. Gmail's own
// `format=raw` response and IMAP's `BODY.PEEK[]` fetch both hand back the
// exact same wire format (a full RFC 5322 message), so there is exactly
// one parser for both instead of Gmail's JSON part-tree walker plus a
// separate IMAP one. Pure and side-effect free — no Prisma, no sockets —
// so it's safe to import from anywhere and easy to unit test.
//
// `raw` throughout this file is a "binary string": one JS char per byte
// (0-255), the same convention src/lib/crypto.ts uses for atob/btoa —
// never a UTF-8-decoded string. Charset decoding only happens at the very
// end, once a leaf part's Content-Transfer-Encoding has been undone.

export interface MimeNode {
  headers: Map<string, string[]>;
  contentType: string;
  params: Record<string, string>;
  disposition: "inline" | "attachment" | null;
  filename: string | null;
  encoding: string;
  body: Uint8Array | null; // leaf nodes only
  children: MimeNode[];
}

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  contentId: string | null;
}

export interface ParsedAddress {
  name: string;
  email: string;
}

export interface ParsedMessage {
  headers: Map<string, string[]>;
  subject: string;
  from: ParsedAddress;
  to: ParsedAddress[];
  cc: ParsedAddress[];
  date: string | null; // ISO
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  deliveredTo: string;
  text: string | null;
  html: string | null;
  attachments: AttachmentMeta[];
}

// ---- base64 ----

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, "");
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    return new Uint8Array(0);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodeBase64(input: string): Uint8Array {
  return base64ToBytes(input);
}

// Gmail's `format=raw` body is base64url (RFC 4648 §5: "-"/"_", no
// padding) — this is the one place that encoding shows up, so it's kept
// separate from the plain base64 decoder MIME bodies use.
export function decodeBase64Url(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return base64ToBytes(padded);
}

// ---- quoted-printable ----

export function decodeQuotedPrintable(input: string): Uint8Array {
  // A line ending in "=" (optionally followed by a newline) is a soft
  // line break — a continuation, not a real one — and is removed outright.
  const unfolded = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i++) {
    const ch = unfolded[i];
    if (ch === "=" && i + 2 < unfolded.length) {
      const hex = unfolded.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(ch.charCodeAt(0) & 0xff);
  }
  return new Uint8Array(bytes);
}

// ---- charset decode ----

export function decodeBytes(bytes: Uint8Array, charset: string | undefined): string {
  const normalized = (charset || "utf-8").trim().toLowerCase().replace(/^"|"$/g, "");
  // workerd's TextDecoder doesn't know "utf-7" or a handful of legacy
  // aliases some old mail clients still send — utf-8 with occasional
  // mojibake beats throwing and dropping the whole message body.
  try {
    return new TextDecoder(normalized).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return "";
    }
  }
}

// ---- RFC 2047 encoded-word decoding (subjects, display names) ----
// e.g. =?UTF-8?B?w4nDqQ==?= or =?ISO-8859-1?Q?caf=E9?=

const ENCODED_WORD = /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g;

export function decodeEncodedWords(value: string): string {
  if (!value) return value;
  // Adjacent encoded-words separated only by whitespace are one logical
  // run per RFC 2047 §2 — that whitespace is an encoding artifact, not
  // part of the decoded text, so it's dropped before decoding.
  const collapsed = value.replace(/(\?=)\s+(=\?)/g, "$1$2");
  return collapsed.replace(ENCODED_WORD, (_match, charset: string, enc: string, text: string) => {
    if (enc.toLowerCase() === "b") {
      return decodeBytes(decodeBase64(text), charset);
    }
    // Q-encoding is quoted-printable with one difference: "_" means a
    // literal space (RFC 2047 §4.2).
    return decodeBytes(decodeQuotedPrintable(text.replace(/_/g, " ")), charset);
  });
}

// ---- header block parsing ----

function unfoldHeaders(raw: string): string {
  // A continuation line starts with a space or tab — RFC 5322 §2.2.3
  // joins it onto the previous line with a single space.
  return raw.replace(/\r\n[ \t]+/g, " ").replace(/\n[ \t]+/g, " ");
}

export function parseHeaderBlock(raw: string, from = 0): { headers: Map<string, string[]>; bodyOffset: number } {
  // The header/body boundary is the first blank line — normally CRLFCRLF,
  // but a bare LFLF is tolerated too (some relays/forwarders rewrite
  // line endings along the way).
  const crlf = raw.indexOf("\r\n\r\n", from);
  const lf = raw.indexOf("\n\n", from);
  const blankIdx = crlf === -1 ? lf : lf === -1 ? crlf : Math.min(crlf, lf);
  const headerEnd = blankIdx === -1 ? raw.length : blankIdx;
  const sep = raw.slice(headerEnd, headerEnd + 4) === "\r\n\r\n" ? 4 : raw.slice(headerEnd, headerEnd + 2) === "\n\n" ? 2 : 0;

  const headerBlock = unfoldHeaders(raw.slice(from, headerEnd));
  const headers = new Map<string, string[]>();
  for (const line of headerBlock.split(/\r?\n/)) {
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    const list = headers.get(name) ?? [];
    list.push(value);
    headers.set(name, list);
  }
  return { headers, bodyOffset: headerEnd + sep };
}

function headerFirst(headers: Map<string, string[]>, name: string): string {
  return headers.get(name.toLowerCase())?.[0] ?? "";
}

// A naive value.split(";") breaks on a semicolon inside a quoted string
// (e.g. a filename: `filename="a; b.pdf"`) — this walks the string
// respecting quotes instead.
function splitQuoteAware(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of value) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === delimiter && !inQuotes) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// Parses a `Content-Type`/`Content-Disposition`-style header:
// `multipart/alternative; boundary="abc123"; charset=utf-8`.
function parseParamHeader(value: string): { primary: string; params: Record<string, string> } {
  const parts = splitQuoteAware(value, ";");
  const primary = (parts[0] ?? "").trim().toLowerCase();
  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    let key = part.slice(0, eq).trim().toLowerCase();
    let val = part.slice(eq + 1).trim();
    // RFC 2231 continuation (name*0=, name*1=) — concatenating in order
    // is close enough; the rarer name*=utf-8''... encoded form is left
    // undecoded rather than fully implementing RFC 2231 for it.
    const starIdx = key.indexOf("*");
    if (starIdx !== -1) key = key.slice(0, starIdx);
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    params[key] = (params[key] ?? "") + decodeEncodedWords(val);
  }
  return { primary, params };
}

// ---- address list parsing ----
// "Name" <a@b.com>, Name <a@b.com>, bare a@b.com, comma-separated lists
// of any of those — split with quote-awareness so a display name
// containing a comma doesn't break the list apart.

export function parseAddressList(value: string): ParsedAddress[] {
  if (!value) return [];
  return splitQuoteAware(value, ",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const angleMatch = raw.match(/<([^>]+)>/);
      if (angleMatch) {
        let name = raw.slice(0, raw.indexOf("<")).trim();
        if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
        return { name: decodeEncodedWords(name), email: angleMatch[1].trim() };
      }
      return { name: "", email: raw };
    });
}

// ---- MIME part tree ----

function normalizeLeafBytes(raw: string, encoding: string): Uint8Array {
  const trimmed = encoding === "base64" ? raw : raw.replace(/\r?\n$/, "");
  if (encoding === "base64") return decodeBase64(trimmed);
  if (encoding === "quoted-printable") return decodeQuotedPrintable(trimmed);
  // 7bit/8bit/binary — already raw bytes; `raw` is the latin1-mapped
  // binary string, so each char code IS the byte value.
  const bytes = new Uint8Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) bytes[i] = trimmed.charCodeAt(i) & 0xff;
  return bytes;
}

export function parseMimeTree(raw: string, from: number, headers: Map<string, string[]>): MimeNode {
  const { primary: contentType, params } = parseParamHeader(headerFirst(headers, "content-type") || "text/plain; charset=us-ascii");
  const { primary: dispositionType, params: dispositionParams } = parseParamHeader(headerFirst(headers, "content-disposition"));
  const encoding = (headerFirst(headers, "content-transfer-encoding") || "7bit").toLowerCase();
  const rawFilename = dispositionParams.filename || params.name || null;

  const node: MimeNode = {
    headers,
    contentType: contentType || "text/plain",
    params,
    disposition: dispositionType === "attachment" ? "attachment" : dispositionType === "inline" ? "inline" : null,
    filename: rawFilename ? decodeEncodedWords(rawFilename) : null,
    encoding,
    body: null,
    children: [],
  };

  if (node.contentType.startsWith("multipart/")) {
    const boundary = params.boundary;
    if (!boundary) return node; // malformed; treat as an empty leaf rather than throwing
    const delimiter = `--${boundary}`;
    const segments = raw.slice(from).split(delimiter);
    // segments[0] is the preamble (ignored, per RFC 2046 §5.1.1); a
    // segment starting with "--" is the closing boundary/epilogue.
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.startsWith("--")) break;
      const lineEnd = seg.indexOf("\n");
      if (lineEnd === -1) continue;
      const partRaw = seg.slice(lineEnd + 1);
      const { headers: partHeaders, bodyOffset } = parseHeaderBlock(partRaw);
      node.children.push(parseMimeTree(partRaw, bodyOffset, partHeaders));
    }
    return node;
  }

  if (node.contentType === "message/rfc822") {
    const inner = raw.slice(from);
    const { headers: innerHeaders, bodyOffset } = parseHeaderBlock(inner);
    node.children.push(parseMimeTree(inner, bodyOffset, innerHeaders));
    return node;
  }

  node.body = normalizeLeafBytes(raw.slice(from), encoding);
  return node;
}

// ---- top-level message parse ----

export function parseMessage(raw: string): ParsedMessage {
  const { headers, bodyOffset } = parseHeaderBlock(raw);
  const root = parseMimeTree(raw, bodyOffset, headers);

  const subject = decodeEncodedWords(headerFirst(headers, "subject"));
  const from = parseAddressList(headerFirst(headers, "from"))[0] ?? { name: "", email: "" };
  const to = parseAddressList(headerFirst(headers, "to"));
  const cc = parseAddressList(headerFirst(headers, "cc"));
  const dateHeader = headerFirst(headers, "date");
  const parsedDate = dateHeader ? new Date(dateHeader) : null;
  const messageId = headerFirst(headers, "message-id").trim() || null;
  const inReplyTo = headerFirst(headers, "in-reply-to").trim() || null;
  const references = headerFirst(headers, "references").match(/<[^>]+>/g) ?? [];
  const deliveredTo = headerFirst(headers, "delivered-to");

  let text: string | null = null;
  let html: string | null = null;
  const attachments: AttachmentMeta[] = [];

  function walk(node: MimeNode) {
    if (node.children.length > 0) {
      for (const child of node.children) walk(child);
      return;
    }
    const isAttachment = node.disposition === "attachment" || (node.filename !== null && !node.contentType.startsWith("text/"));
    if (isAttachment) {
      attachments.push({
        filename: node.filename ?? "attachment",
        mimeType: node.contentType,
        sizeBytes: node.body?.byteLength ?? 0,
        contentId: headerFirst(node.headers, "content-id").replace(/^<|>$/g, "") || null,
      });
      return;
    }
    if (node.contentType === "text/html" && node.body) {
      html = decodeBytes(node.body, node.params.charset);
      return;
    }
    if (node.contentType === "text/plain" && node.body && text === null) {
      text = decodeBytes(node.body, node.params.charset);
    }
  }
  walk(root);

  return {
    headers,
    subject: subject || "(no subject)",
    from,
    to,
    cc,
    date: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
    messageId,
    inReplyTo,
    references,
    deliveredTo,
    text,
    html,
    attachments,
  };
}
