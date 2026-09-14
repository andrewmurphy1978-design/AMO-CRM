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

function createPrismaClient(): PrismaClient {
  const workers = isCloudflareWorkers();
  const PrismaClient = loadPrismaClientClass(workers);
  const pool = new Pool({ connectionString: resolveConnectionString(workers) });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

// The client must not be built until something actually uses it (see
// isCloudflareWorkers() above), so this Proxy defers that first real Prisma
// call to whichever request-scoped function (Server Component, Server
// Action, Route Handler) triggers it, while every caller can keep importing
// `prisma` and using it exactly like a normal, already-constructed
// PrismaClient.
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient() as object, prop, receiver);
  },
});
