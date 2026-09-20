import { createRequire } from "node:module";
import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type PrismaClient = PrismaClientType;

const require = createRequire(import.meta.url);

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
  // @prisma/adapter-pg's default behavior for a caller-supplied Pool
  // instance (as opposed to a bare connection config it builds its own
  // Pool from) is to treat the Pool's lifecycle as the caller's
  // responsibility — its cleanup on $disconnect() only removes its error
  // listener, it never calls pool.end(). Every fresh Pool created here
  // (once per withScopedPrismaClient call, i.e. once per request) was
  // therefore leaking its underlying TCP connection forever — the actual
  // cause of Error 1102 recurring after enough page loads/actions
  // accumulated open connections against Hyperdrive/Neon, independent of
  // how many queries any single request ran. disposeExternalPool makes
  // $disconnect() actually call pool.end() and close the socket.
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

// Every database access in this app goes through this function — there is
// no shared/cached client and no raw `prisma` export. An earlier version
// had one (a Proxy that built a fresh client on every property access);
// it was removed once an audit confirmed every real caller already went
// through this function instead, and keeping it around was a live
// landmine: a raw `prisma.model.method()` call left `$disconnect()` never
// invoked, silently leaking a Postgres connection against Hyperdrive/Neon
// on every single invocation forever (the root cause behind a long-running
// "Error 1102" saga in this app's history) — see disposeExternalPool above
// for the other half of that bug (a client that WAS disconnected wasn't
// actually closing its Pool either).
//
// In Cloudflare Workers, a Pool's underlying TCP socket belongs only to the
// request that opened it — reusing one across requests doesn't fail
// cleanly, it hangs forever (this was the cause of the earlier "Error 1101"
// / hung-request bugs) — so a cached, cross-request client was never safe
// there. This builds a fresh client for every call, on every platform,
// hands it to `fn`, and disconnects it (now that disposeExternalPool makes
// that actually close the socket) when `fn` resolves or throws — created,
// used, and torn down within one continuous invocation, so there's no
// cross-invocation socket reuse for Workers' I/O model to object to.
// Hyperdrive pools connections on Cloudflare's side specifically so that
// doing this per call is cheap.
export async function withScopedPrismaClient<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const client = createPrismaClient(isCloudflareWorkers());
  try {
    return await fn(client);
  } finally {
    await client.$disconnect().catch(() => {});
  }
}
