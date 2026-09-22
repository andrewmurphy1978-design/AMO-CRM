// Minimal ambient types for Cloudflare's `cloudflare:sockets` module — same
// reason as cloudflare.d.ts's comment: `wrangler types`' generated
// cloudflare-env.d.ts is gitignored (regenerated per-machine via
// `npm run cf:typegen`), so relying on it made src/lib/mail/socket.ts
// type-check locally while failing in CI's fresh checkout, which has no
// such file. Declares only the pieces socket.ts actually uses.
declare module "cloudflare:sockets" {
  interface SocketOptions {
    secureTransport?: string;
    allowHalfOpen: boolean;
    highWaterMark?: number | bigint;
  }

  interface TlsOptions {
    expectedServerHostname?: string;
  }

  interface SocketInfo {
    remoteAddress?: string;
    localAddress?: string;
  }

  interface Socket {
    readonly readable: ReadableStream<Uint8Array>;
    readonly writable: WritableStream<Uint8Array>;
    readonly closed: Promise<void>;
    readonly opened: Promise<SocketInfo>;
    readonly upgraded: boolean;
    readonly secureTransport: "on" | "off" | "starttls";
    close(): Promise<void>;
    startTls(options?: TlsOptions): Socket;
  }

  export function connect(address: string, options?: SocketOptions): Socket;
}
