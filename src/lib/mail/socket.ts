// A shared line-oriented TCP/TLS socket helper for the hand-rolled SMTP
// (smtp.ts) and IMAP (imap.ts) clients — both are text-line protocols with
// occasional raw byte blocks (SMTP's DATA body, IMAP's `{n}` literals), so
// one small buffered reader serves both.
//
// Built on Cloudflare's `cloudflare:sockets` module, the only way to open
// a raw outbound TCP connection from a Worker — there is no Node net/tls
// here, so npm packages like nodemailer/imapflow don't work on this
// runtime. The exact technique below (dynamic `import('cloudflare:sockets')`
// inside an async function, never a static top-level import; startTls()
// releasing the old reader/writer locks and swapping in a new socket) is
// not a guess — it's copied from pg-cloudflare, the same package this
// app's own Postgres connectivity already depends on and already ships to
// production successfully through this exact Next.js/OpenNext build, which
// is what proves a static top-level `import "cloudflare:sockets"` would
// break `next build` (plain Node, no such module) while the dynamic form
// survives it and works once actually running on the deployed Worker.

export type MailSecurity = "tls" | "starttls" | "plain";

export interface MailSocketOptions {
  hostname: string;
  port: number;
  security: MailSecurity;
  timeoutMs?: number;
}

export interface MailSocket {
  readLine(): Promise<string>;
  readExact(byteCount: number): Promise<Uint8Array>;
  write(data: string | Uint8Array): Promise<void>;
  startTls(): Promise<void>;
  close(): Promise<void>;
  readonly isSecure: boolean;
}

class MailTransportUnavailableError extends Error {
  constructor() {
    super("Raw TCP sockets are only available on the deployed Cloudflare Worker, not in local dev/build.");
    this.name = "MailTransportUnavailableError";
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function encodeLatin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

// The "cloudflare:sockets" ambient module (declared globally in this repo's
// generated cloudflare-env.d.ts, from `wrangler types`) only type-checks —
// it isn't a real module outside workerd, which is exactly why the import
// below has to stay dynamic (see the file-level comment).
type CfConnect = typeof import("cloudflare:sockets").connect;
type CfSocket = ReturnType<CfConnect>;

export async function openMailSocket(opts: MailSocketOptions): Promise<MailSocket> {
  const timeoutMs = opts.timeoutMs ?? 20_000;

  let connectFn: CfConnect;
  try {
    // webpackIgnore/turbopackIgnore keep the bundler from trying to
    // statically resolve a module that only exists inside workerd — see
    // the file-level comment for why this must stay dynamic.
    const mod = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "cloudflare:sockets");
    connectFn = mod.connect;
  } catch {
    throw new MailTransportUnavailableError();
  }

  let cfSocket: CfSocket = connectFn(`${opts.hostname}:${opts.port}`, {
    secureTransport: opts.security === "tls" ? "on" : opts.security === "starttls" ? "starttls" : "off",
    allowHalfOpen: false,
  });
  let writer = cfSocket.writable.getWriter();
  let reader: ReadableStreamDefaultReader<Uint8Array> = cfSocket.readable.getReader();
  let isSecure = opts.security === "tls";

  let buffer = new Uint8Array(0);
  let eof = false;

  function appendToBuffer(chunk: Uint8Array) {
    const next = new Uint8Array(buffer.length + chunk.length);
    next.set(buffer, 0);
    next.set(chunk, buffer.length);
    buffer = next;
  }

  async function fill(): Promise<void> {
    if (eof) throw new Error("Connection closed by remote server");
    const { done, value } = await withTimeout(reader.read(), timeoutMs, "socket read");
    if (done) {
      eof = true;
      throw new Error("Connection closed by remote server");
    }
    if (value) appendToBuffer(value);
  }

  async function readLine(): Promise<string> {
    for (;;) {
      const idx = buffer.indexOf(10); // "\n"
      if (idx !== -1) {
        let lineEnd = idx;
        if (lineEnd > 0 && buffer[lineEnd - 1] === 13) lineEnd -= 1; // trim trailing "\r"
        const lineBytes = buffer.slice(0, lineEnd);
        buffer = buffer.slice(idx + 1);
        let line = "";
        for (let i = 0; i < lineBytes.length; i++) line += String.fromCharCode(lineBytes[i]);
        return line;
      }
      await fill();
    }
  }

  async function readExact(byteCount: number): Promise<Uint8Array> {
    while (buffer.length < byteCount) await fill();
    const result = buffer.slice(0, byteCount);
    buffer = buffer.slice(byteCount);
    return result;
  }

  async function write(data: string | Uint8Array): Promise<void> {
    const bytes = typeof data === "string" ? encodeLatin1(data) : data;
    await withTimeout(writer.write(bytes), timeoutMs, "socket write");
  }

  async function startTls(): Promise<void> {
    if (buffer.length > 0) {
      // A protocol violation — the server sent bytes ahead of the TLS
      // handshake it hasn't started yet. Safer to fail loudly than to
      // silently drop or misinterpret them post-upgrade.
      throw new Error("startTls() called with unread plaintext still buffered");
    }
    writer.releaseLock();
    reader.releaseLock();
    cfSocket = cfSocket.startTls();
    writer = cfSocket.writable.getWriter();
    reader = cfSocket.readable.getReader();
    isSecure = true;
  }

  async function close(): Promise<void> {
    try {
      await writer.close();
    } catch {
      // Already closed/errored — nothing more to do.
    }
    try {
      await cfSocket.close();
    } catch {
      // Same.
    }
  }

  return {
    readLine,
    readExact,
    write,
    startTls,
    close,
    get isSecure() {
      return isSecure;
    },
  };
}
