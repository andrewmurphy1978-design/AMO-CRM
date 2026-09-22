// A minimal hand-rolled SMTP client — see socket.ts for why (no Node
// net/tls on Cloudflare Workers, so nodemailer doesn't work here). Only
// implements what sending a single message needs: EHLO, STARTTLS, AUTH
// PLAIN/LOGIN, MAIL FROM/RCPT TO/DATA, QUIT. Defaults IONOS to port 465
// implicit TLS to avoid the STARTTLS upgrade path entirely on the first
// cut, but every setting is configurable from Settings since IONOS's exact
// behavior is unverified until this runs live (this sandbox blocks raw
// outbound TCP, so none of this can be tested locally at all).

import { openMailSocket, type MailSecurity, type MailSocket } from "./socket";

export interface SmtpConfig {
  host: string;
  port: number;
  security: MailSecurity;
  username: string;
  password: string;
}

export interface SmtpEnvelope {
  from: string; // bare address, MAIL FROM
  to: string[];
  cc: string[];
  bcc: string[];
  raw: string; // the already-built RFC 5322 message from mime-build.ts
}

interface SmtpResponse {
  code: number;
  lines: string[];
}

async function readResponse(sock: MailSocket): Promise<SmtpResponse> {
  const lines: string[] = [];
  let code = 0;
  for (;;) {
    const line = await sock.readLine();
    const match = line.match(/^(\d{3})([ -])(.*)$/);
    if (!match) throw new Error(`Malformed SMTP response: ${line}`);
    code = Number(match[1]);
    lines.push(match[3]);
    if (match[2] === " ") break; // final line of this response
  }
  return { code, lines };
}

function expect(response: SmtpResponse, okCodes: number[], step: string): void {
  if (!okCodes.includes(response.code)) {
    throw new Error(`SMTP ${step} failed (${response.code}): ${response.lines.join(" ")}`);
  }
}

function base64(text: string): string {
  let binary = "";
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Any line starting with "." becomes ".." per RFC 5321 §4.5.2 — otherwise
// a message body line that happens to start with a period would be read
// by the server as the end-of-DATA marker.
function dotStuff(raw: string): string {
  const withCrlf = raw.replace(/\r\n|\r|\n/g, "\r\n");
  const stuffed = withCrlf.replace(/(^|\r\n)\./g, "$1..");
  return stuffed.endsWith("\r\n") ? stuffed : `${stuffed}\r\n`;
}

async function ehlo(sock: MailSocket, domain: string): Promise<string[]> {
  await sock.write(`EHLO ${domain}\r\n`);
  const response = await readResponse(sock);
  expect(response, [250], "EHLO");
  return response.lines.map((l) => l.toUpperCase());
}

async function authLogin(sock: MailSocket, username: string, password: string): Promise<void> {
  await sock.write("AUTH LOGIN\r\n");
  expect(await readResponse(sock), [334], "AUTH LOGIN");
  await sock.write(`${base64(username)}\r\n`);
  expect(await readResponse(sock), [334], "AUTH LOGIN username");
  await sock.write(`${base64(password)}\r\n`);
  expect(await readResponse(sock), [235], "AUTH LOGIN password");
}

async function authenticate(sock: MailSocket, capabilities: string[], username: string, password: string): Promise<void> {
  const authLine = capabilities.find((c) => c.startsWith("AUTH "));
  const mechanisms = authLine ? authLine.slice(5).split(/\s+/) : [];

  if (mechanisms.includes("PLAIN")) {
    await sock.write(`AUTH PLAIN ${base64(`\u0000${username}\u0000${password}`)}\r\n`);
    const response = await readResponse(sock);
    if (response.code === 235) return;
    // Some servers advertise PLAIN but reject it inconsistently (seen with
    // IONOS's load-balanced SMTP frontends) while still accepting LOGIN
    // with the exact same credentials — worth one more attempt with the
    // same password before concluding the credentials themselves are bad.
    if (mechanisms.includes("LOGIN")) {
      await authLogin(sock, username, password);
      return;
    }
    throw new Error(`SMTP AUTH PLAIN failed (${response.code}): ${response.lines.join(" ")}`);
  }

  // AUTH LOGIN (or no capability advertised at all, which some servers
  // simply don't bother listing even though they accept it) — try it as
  // the fallback either way.
  await authLogin(sock, username, password);
}

async function connectAndLogin(cfg: SmtpConfig): Promise<MailSocket> {
  const sock = await openMailSocket({ hostname: cfg.host, port: cfg.port, security: cfg.security });
  expect(await readResponse(sock), [220], "greeting");

  let capabilities = await ehlo(sock, "crm.andrewmurphy.online");

  if (cfg.security === "starttls") {
    await sock.write("STARTTLS\r\n");
    expect(await readResponse(sock), [220], "STARTTLS");
    await sock.startTls();
    // Capabilities must be re-read post-upgrade — a server may only
    // advertise AUTH after TLS is active.
    capabilities = await ehlo(sock, "crm.andrewmurphy.online");
  }

  await authenticate(sock, capabilities, cfg.username, cfg.password);
  return sock;
}

export async function sendViaSmtp(cfg: SmtpConfig, env: SmtpEnvelope): Promise<void> {
  const sock = await connectAndLogin(cfg);
  try {
    await sock.write(`MAIL FROM:<${env.from}>\r\n`);
    expect(await readResponse(sock), [250], "MAIL FROM");

    for (const recipient of [...env.to, ...env.cc, ...env.bcc]) {
      await sock.write(`RCPT TO:<${recipient}>\r\n`);
      const response = await readResponse(sock);
      if (![250, 251].includes(response.code)) {
        throw new Error(`SMTP RCPT TO <${recipient}> rejected (${response.code}): ${response.lines.join(" ")}`);
      }
    }

    await sock.write("DATA\r\n");
    expect(await readResponse(sock), [354], "DATA");
    await sock.write(dotStuff(env.raw));
    await sock.write(".\r\n");
    expect(await readResponse(sock), [250], "message body");

    await sock.write("QUIT\r\n");
    await readResponse(sock).catch(() => {}); // best-effort
  } finally {
    await sock.close();
  }
}

// Powers the Settings "Test connection" button — logs in and quits
// without sending anything, so a bad host/port/credential surfaces
// immediately instead of only being discovered on the first real reply.
export async function verifySmtp(cfg: SmtpConfig): Promise<void> {
  const sock = await connectAndLogin(cfg);
  try {
    await sock.write("QUIT\r\n");
    await readResponse(sock).catch(() => {});
  } finally {
    await sock.close();
  }
}
