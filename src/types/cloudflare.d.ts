// @opennextjs/cloudflare types `getCloudflareContext().env` as the global
// `CloudflareEnv` interface — this augments it with our Hyperdrive binding.
//
// This declares only the shape we actually use, rather than depending on
// `wrangler types`' generated cloudflare-env.d.ts (gitignored, regenerated
// per-machine via `npm run cf:typegen`), so a fresh clone always type-checks
// without that extra step.
declare global {
  interface Hyperdrive {
    connectionString: string;
  }

  interface CloudflareEnv {
    HYPERDRIVE: Hyperdrive;
  }
}

export {};
