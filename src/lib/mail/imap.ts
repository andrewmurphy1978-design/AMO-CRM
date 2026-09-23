// A minimal hand-rolled IMAP4rev1 client (RFC 3501) — same reason as
// smtp.ts: no Node net/tls on Cloudflare Workers, so imapflow/node-imap
// don't run here. Only implements what the Email page's IONOS mailbox
// actually needs: LOGIN, SELECT INBOX, a sequence-range FETCH for the
// recent-messages list, and a single UID FETCH BODY[] for the full raw
// message (fed into the same mime-parse.ts parser Gmail's format=raw
// uses — see that file's header comment).
//
// Each call here opens a fresh connection and logs out at the end —
// Worker invocations are short-lived, so there's no long-running
// connection to pool the way a persistent IMAP client normally would.

import { openMailSocket, type MailSecurity, type MailSocket } from "./socket";
import { parseHeaderBlock, parseAddressList, decodeEncodedWords } from "./mime-parse";

export interface ImapConfig {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password: string;
}

export interface ImapMessageSummary {
  uid: number;
  seen: boolean;
  internalDate: string | null; // ISO
  from: { name: string; email: string };
  to: string[];
  cc: string[];
  subject: string;
  date: string | null; // ISO, from the message's own Date header
  messageIdHeader: string | null;
  // Matched against a SentEmailRecord's own messageId to reconcile
  // whether an IONOS-sent message is still "awaiting" a reply or has one
  // now — see reconcileIonosSentRecords in sent-records.ts.
  inReplyTo: string | null;
  references: string[];
  hasAttachments: boolean;
  important: boolean;
}

// One reconstructed IMAP response line, plus where any literal(s) in it
// ended up after substitution — parseFetchDataItems needs the exact span,
// not just the flattened text, since a literal's content (arbitrary
// header/body bytes) can't safely be re-identified by scanning for quotes/
// parens/whitespace the way a normal atom, quoted string or list can.
interface LogicalLine {
  text: string;
  literals: { start: number; length: number }[];
}

function sliceLogicalLine(line: LogicalLine, n: number): LogicalLine {
  return { text: line.text.slice(n), literals: line.literals.map((l) => ({ start: l.start - n, length: l.length })) };
}

interface ImapTaggedResponse {
  status: "OK" | "NO" | "BAD";
  text: string;
  untagged: LogicalLine[];
}

class ImapCommandError extends Error {}

// A response line ending in "{n}" (or "{n+}", the non-synchronizing form —
// never used by a server responding to us, but tolerated) is followed
// immediately by exactly n raw octets (which may contain embedded CRLFs,
// e.g. a message body), then the rest of that same logical line resumes.
// This reconstructs one logical line by resolving every literal in it,
// recording each one's final position/length so callers can tell a
// literal's raw content apart from ordinary IMAP syntax around it.
async function readLogicalLine(sock: MailSocket): Promise<LogicalLine> {
  let text = await sock.readLine();
  const literals: { start: number; length: number }[] = [];
  for (;;) {
    const m = text.match(/\{(\d+)\+?\}$/);
    if (!m || m.index === undefined) return { text, literals };
    const byteCount = Number(m[1]);
    const literalBytes = await sock.readExact(byteCount);
    let literalStr = "";
    for (let i = 0; i < literalBytes.length; i++) literalStr += String.fromCharCode(literalBytes[i]);
    const rest = await sock.readLine();
    literals.push({ start: m.index, length: literalStr.length });
    text = text.slice(0, m.index) + literalStr + rest;
  }
}

class ImapSession {
  private tagCounter = 0;

  constructor(private sock: MailSocket) {}

  private nextTag(): string {
    this.tagCounter += 1;
    return `A${this.tagCounter}`;
  }

  async command(text: string): Promise<ImapTaggedResponse> {
    const tag = this.nextTag();
    await this.sock.write(`${tag} ${text}\r\n`);
    const untagged: LogicalLine[] = [];
    for (;;) {
      const line = await readLogicalLine(this.sock);
      if (line.text.startsWith("* ")) {
        untagged.push(sliceLogicalLine(line, 2));
        continue;
      }
      if (line.text.startsWith(`${tag} `)) {
        const rest = line.text.slice(tag.length + 1);
        const m = rest.match(/^(OK|NO|BAD)\b(.*)$/i);
        if (!m) throw new ImapCommandError(`Malformed IMAP tagged response: ${line.text}`);
        return { status: m[1].toUpperCase() as "OK" | "NO" | "BAD", text: m[2].trim(), untagged };
      }
      // A stray continuation prompt or anything else unexpected — none of
      // our commands send literals, so a "+" prompt shouldn't occur, but
      // skipping rather than throwing keeps a single odd line from
      // aborting an otherwise-successful command.
    }
  }

  async readGreeting(): Promise<void> {
    const line = await readLogicalLine(this.sock);
    if (!line.text.startsWith("* OK") && !line.text.startsWith("* PREAUTH")) {
      throw new ImapCommandError(`Unexpected IMAP greeting: ${line.text}`);
    }
  }

  async close(): Promise<void> {
    await this.sock.close();
  }
}

// IMAP quoted-string escaping (RFC 3501 §4.3) — backslash and double-quote
// must be backslash-escaped. Real-world mailbox credentials essentially
// never contain a bare CR/LF, so the literal syntax IMAP would otherwise
// require for those isn't implemented here (same scope call as smtp.ts).
function quoteImapString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function expect(response: ImapTaggedResponse, step: string): void {
  if (response.status !== "OK") {
    throw new Error(`IMAP ${step} failed: ${response.text || response.status}`);
  }
}

async function connectAndLogin(cfg: ImapConfig): Promise<ImapSession> {
  const sock = await openMailSocket({ hostname: cfg.host, port: cfg.port, security: cfg.security });
  const session = new ImapSession(sock);
  await session.readGreeting();
  const login = await session.command(`LOGIN ${quoteImapString(cfg.username)} ${quoteImapString(cfg.password)}`);
  expect(login, "LOGIN");
  return session;
}

// Powers the Settings "Test connection" button's IMAP half — logs in,
// selects INBOX, and logs out without fetching anything.
export async function verifyImap(cfg: ImapConfig): Promise<void> {
  const session = await connectAndLogin(cfg);
  try {
    expect(await session.command("SELECT INBOX"), "SELECT INBOX");
    await session.command("LOGOUT").catch(() => {});
  } finally {
    await session.close();
  }
}

function parseExists(untagged: LogicalLine[]): number {
  for (const line of untagged) {
    const m = line.text.match(/^(\d+) EXISTS$/i);
    if (m) return Number(m[1]);
  }
  return 0;
}

// Splits one "* n FETCH (...)" logical line's parenthesized data-item list
// into top-level {name, value} pairs. UID/FLAGS/INTERNALDATE are always
// well-formed atoms/quoted-strings/parenthesized lists, so those are
// parsed generically — but a bracketed item's value (BODY[...]) is
// whatever raw literal followed it, which can contain absolutely any
// byte (quotes, parens, blank lines) as ordinary header/body content, so
// its span is taken verbatim from the line's own recorded literal
// positions instead of being re-inferred from punctuation.
function parseFetchDataItems(line: LogicalLine): Map<string, string> {
  const { text, literals } = line;
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");
  if (open === -1 || close === -1) return new Map();
  const end = close;
  const items = new Map<string, string>();
  let i = open + 1;
  while (i < end) {
    while (i < end && text[i] === " ") i++;
    if (i >= end) break;
    const nameStart = i;
    while (i < end && text[i] !== " " && text[i] !== "[") i++;
    let name = text.slice(nameStart, i);
    if (text[i] === "[") {
      const bracketEnd = text.indexOf("]", i);
      i = bracketEnd === -1 ? end : bracketEnd + 1;
      name = "BODY[]"; // the only bracketed item this client ever requests
    }
    while (i < end && text[i] === " ") i++;
    if (i >= end) {
      items.set(name, "");
      break;
    }

    const literal = literals.find((l) => l.start === i);
    let value: string;
    if (literal) {
      value = text.slice(literal.start, literal.start + literal.length);
      i = literal.start + literal.length;
    } else if (text[i] === '"') {
      const quoteEnd = text.indexOf('"', i + 1);
      value = text.slice(i + 1, quoteEnd === -1 ? end : quoteEnd);
      i = quoteEnd === -1 ? end : quoteEnd + 1;
    } else if (text[i] === "(") {
      let depth = 1;
      const start = i + 1;
      i++;
      while (i < end && depth > 0) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")") depth--;
        i++;
      }
      value = text.slice(start, i - 1);
    } else {
      const start = i;
      while (i < end && text[i] !== " ") i++;
      value = text.slice(start, i);
    }
    items.set(name, value);
  }
  return items;
}

function buildSummary(uid: number, items: Map<string, string>): ImapMessageSummary {
  const flags = items.get("FLAGS") ?? "";
  const seen = /\\Seen/i.test(flags);
  const internalDateRaw = items.get("INTERNALDATE") ?? "";
  const internalDate = internalDateRaw ? new Date(internalDateRaw) : null;
  const headerBlock = items.get("BODY[]") ?? "";
  const { headers } = parseHeaderBlock(headerBlock);
  const headerFirst = (name: string) => headers.get(name.toLowerCase())?.[0] ?? "";

  const fromAddr = parseAddressList(headerFirst("from"))[0] ?? { name: "", email: "" };
  const dateHeader = headerFirst("date");
  const parsedDate = dateHeader ? new Date(dateHeader) : null;
  const contentType = headerFirst("content-type").toLowerCase();
  const importance = headerFirst("importance").toLowerCase();
  const priority = headerFirst("x-priority").toLowerCase();

  return {
    uid,
    seen,
    internalDate: internalDate && !isNaN(internalDate.getTime()) ? internalDate.toISOString() : null,
    from: fromAddr,
    to: parseAddressList(headerFirst("to")).map((a) => a.email),
    cc: parseAddressList(headerFirst("cc")).map((a) => a.email),
    subject: decodeEncodedWords(headerFirst("subject")) || "(no subject)",
    date: parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null,
    messageIdHeader: headerFirst("message-id").trim() || null,
    inReplyTo: headerFirst("in-reply-to").trim() || null,
    references: headerFirst("references").match(/<[^>]+>/g) ?? [],
    // A rough heuristic from the header alone (no body parts fetched at
    // list time) — a multipart/mixed top-level type is what every common
    // mail client uses for "message + attachment(s)".
    hasAttachments: contentType.startsWith("multipart/mixed"),
    important: importance === "high" || priority === "1" || priority === "highest",
  };
}

// Fetches up to `maxResults` of the mailbox's most recent messages,
// headers-only (never plain BODY, so this never marks anything read) —
// the same "cheap list" principle fetchEmailSummary in google.ts follows
// for Gmail. No body/snippet is fetched here (unlike Gmail's own
// snippet field) — deliberately left out rather than parsing each
// message's MIME tree just for a preview string; the classifier still
// works fine from subject + sender alone.
export async function listRecentImapMessages(cfg: ImapConfig, maxResults: number, folder: string = "INBOX"): Promise<ImapMessageSummary[]> {
  const session = await connectAndLogin(cfg);
  try {
    const select = await session.command(`SELECT ${folder}`);
    expect(select, `SELECT ${folder}`);
    const exists = parseExists(select.untagged);
    if (exists === 0) return [];

    const start = Math.max(1, exists - maxResults + 1);
    const fetch = await session.command(
      `FETCH ${start}:${exists} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE MESSAGE-ID IN-REPLY-TO REFERENCES CONTENT-TYPE IMPORTANCE X-PRIORITY)])`
    );
    expect(fetch, "FETCH");

    const summaries: ImapMessageSummary[] = [];
    for (const line of fetch.untagged) {
      if (!/^\d+ FETCH /i.test(line.text)) continue;
      const items = parseFetchDataItems(line);
      const uid = Number(items.get("UID"));
      if (!uid) continue;
      summaries.push(buildSummary(uid, items));
    }
    // FETCH on an ascending sequence range returns oldest-first — reverse
    // so the newest message leads, matching getRecentEmails' Gmail order.
    return summaries.reverse();
  } finally {
    await session.command("LOGOUT").catch(() => {});
    await session.close();
  }
}

// The Email Dialog's "open a message" call for an IONOS-sourced message —
// BODY.PEEK[] (never plain BODY[], so opening a message in the CRM never
// marks it \Seen on the server) fetches the complete RFC 5322 text
// verbatim, no base64 wrapping (unlike Gmail's format=raw) — fed directly
// into the same parseMessage() Gmail's raw fetch uses.
export async function fetchImapMessageRaw(cfg: ImapConfig, uid: number, folder: string = "INBOX"): Promise<string | null> {
  const session = await connectAndLogin(cfg);
  try {
    expect(await session.command(`SELECT ${folder}`), `SELECT ${folder}`);
    const fetch = await session.command(`UID FETCH ${uid} (BODY.PEEK[])`);
    expect(fetch, "UID FETCH");
    const line = fetch.untagged.find((l) => /^\d+ FETCH /i.test(l.text));
    if (!line) return null;
    const items = parseFetchDataItems(line);
    return items.get("BODY[]") ?? null;
  } finally {
    await session.command("LOGOUT").catch(() => {});
    await session.close();
  }
}

// Syncs the CRM's own "opened this message" state (EmailReadState — kept
// deliberately separate from the server's own \Seen flag everywhere else
// in this file, so listing/opening a message here never marks it read on
// the server behind the user's back) out to the actual mailbox, only when
// the user explicitly marks a message read/unread from the Email page —
// so a native mail app or webmail session checking the same mailbox
// agrees with what the CRM shows, instead of drifting from it silently.
export async function setImapSeenFlag(cfg: ImapConfig, uid: number, seen: boolean): Promise<void> {
  const session = await connectAndLogin(cfg);
  try {
    expect(await session.command("SELECT INBOX"), "SELECT INBOX");
    const op = seen ? "+FLAGS" : "-FLAGS";
    expect(await session.command(`UID STORE ${uid} ${op} (\\Seen)`), "UID STORE");
  } finally {
    await session.command("LOGOUT").catch(() => {});
    await session.close();
  }
}

// The Email page's "Drafts waiting for your approval" section, IONOS
// side — same listing as listRecentImapMessages but against the Drafts
// mailbox. Wrapped in its own try/catch (rather than letting a caller's
// Promise.all fail outright) since "Drafts" isn't a name IMAP servers are
// required to use verbatim — a mailbox some IONOS accounts name
// differently should degrade to an empty list, not break the page.
export async function listDraftMessages(cfg: ImapConfig, maxResults: number): Promise<ImapMessageSummary[]> {
  try {
    return await listRecentImapMessages(cfg, maxResults, "Drafts");
  } catch {
    return [];
  }
}

// Removes a draft from the Drafts mailbox after it's been sent or
// discarded — IMAP has no single "delete" verb, just the two-step
// mark-then-purge every client uses.
export async function deleteImapMessage(cfg: ImapConfig, uid: number, folder: string): Promise<void> {
  const session = await connectAndLogin(cfg);
  try {
    expect(await session.command(`SELECT ${folder}`), `SELECT ${folder}`);
    expect(await session.command(`UID STORE ${uid} +FLAGS (\\Deleted)`), "UID STORE");
    await session.command("EXPUNGE");
  } finally {
    await session.command("LOGOUT").catch(() => {});
    await session.close();
  }
}
