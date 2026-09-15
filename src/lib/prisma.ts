import { createRequire } from "node:module";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type PrismaClient = PrismaClientType;

const require = createRequire(import.meta.url);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// getCloudflareContext() only succeeds once inside a request being handled
// under the real Cloudflare Workers runtime (it reads bindings out of an
// AsyncLocalStorage set up per-request) — everywhere else (local `next dev`,
// `next build`, `prisma migrate`, the seed script) it throws.
function isCloudflareWorkers(): boolean {
  try {
    getCloudflareContext();
    return true;
  } catch {
    return false;
  }
}

function resolveConnectionString(workers: boolean): string {
  // On Cloudflare Workers, the app can't open its own connection to
  // Postgres — Hyperdrive pools/proxies it instead.
  if (workers) {
    const { env } = getCloudflareContext();
    if (env?.HYPERDRIVE?.connectionString) {
      return env.HYPERDRIVE.connectionString;
    }
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");
  return url;
}

// The default "@prisma/client" entrypoint loads its WASM query compiler
// with fs.readFileSync, which Cloudflare Workers has no filesystem for.
// "@prisma/client/wasm" is the same engine-less "client" build with the
// compiler loaded via a dynamic `import()` of the .wasm file instead —
// esbuild (via OpenNext, when actually bundling for Workers) turns that
// into a real WebAssembly.Module, which is what makes it work there. That
// same import, executed directly by plain Node.js (`next dev`/`next
// build`, no such bundling step) resolves to the wrong shape and breaks
// every query — so this must only be used when actually inside Workers.
function loadPrismaClientClass(workers: boolean): typeof PrismaClientType {
  const mod = workers ? require("@prisma/client/wasm") : require("@prisma/client");
  return mod.PrismaClient;
}

function createPrismaClient(workers: boolean): PrismaClient {
  const PrismaClient = loadPrismaClientClass(workers);
  // Cloudflare Hyperdrive already pools connections on its side, so the
  // local pool here only ever needs to hold the connection(s) for a single
  // request; keep it small.
  const pool = new Pool({ connectionString: resolveConnectionString(workers), max: workers ? 1 : 3 });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

// In Cloudflare Workers, a Pool's underlying TCP socket belongs only to the
// request that opened it — the module scope (globalThis) can be reused by
// an unrelated later request in the same isolate, and a later request
// reusing a socket from a previous one doesn't fail cleanly, it hangs
// forever (this was the cause of the "Error 1101" / hung-request bugs). So
// the client must NEVER be cached on globalThis under Workers.
//
// But it still needs to be cached *somewhere* for the lifetime of a single
// request — without this, every top-level `prisma.<model>` access built a
// brand new Pool from scratch (each a fresh Hyperdrive connection), so a
// page issuing several queries paid that connection cost several times
// over. OpenNext's worker entrypoint creates a fresh `{ env, ctx, cf }`
// object per request via AsyncLocalStorage (see runWithCloudflareRequestContext
// in @opennextjs/cloudflare's init template) and getCloudflareContext()
// returns that same object for every call made during that one request —
// so it's a safe, per-request-scoped place to memoize the client: never
// reused across requests, reused freely within one.
//
// Plain Node.js (local dev, `next build`, scripts) is a normal long-lived
// process with no such per-request isolation, so caching on globalThis
// there is safe and avoids reconnecting on every call.
function getPrismaClient(): PrismaClient {
  const workers = isCloudflareWorkers();
  if (workers) {
    const ctx = getCloudflareContext() as unknown as { __prisma?: PrismaClient };
    if (!ctx.__prisma) {
      ctx.__prisma = createPrismaClient(true);
    }
    return ctx.__prisma;
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient(false);
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient() as object, prop, receiver);
  },
});
