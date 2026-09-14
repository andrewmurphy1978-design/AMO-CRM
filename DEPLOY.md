# Deploying to Cloudflare (free plan)

This app runs on **Cloudflare Workers** via the [OpenNext](https://opennext.js.org/cloudflare)
adapter. Cloudflare doesn't host Postgres itself, so the database lives on
**Neon** (a separate free Postgres host) and Cloudflare's **Hyperdrive**
pools/proxies the Worker's connections to it.

Everything below uses the Cloudflare free plan and Neon's free tier — no
credit card required for either.

This whole guide runs on **your own computer** (or any machine with normal
internet access), not inside this session — the sandbox this app was built
in can't reach Cloudflare's or Neon's servers itself.

## What you'll end up with

- A Neon Postgres database holding your contacts, projects, and tasks.
- A Cloudflare Worker (on a free `*.workers.dev` URL, or your own domain)
  running the CRM.
- A Cloudflare Hyperdrive config bridging the two.

## 1. Get the code onto your computer

```bash
git clone <your repo URL>
cd AMO-CRM
npm install
```

## 2. Create the Neon database

1. Go to [neon.tech](https://neon.tech) and sign up (free).
2. Create a new project. Note the **connection string** it gives you —
   it looks like `postgresql://user:password@ep-xxxx.region.aws.neon.tech/dbname?sslmode=require`.
   Neon shows two variants (pooled/direct); either works for the steps below.

## 3. Set up your local `.env` for one-time setup

```bash
cp .env.example .env
```

Edit `.env`:

- `DATABASE_URL` → paste the Neon connection string from step 2.
- `AUTH_SECRET` → generate with `openssl rand -base64 32`.
- `ENCRYPTION_KEY` → generate with `openssl rand -base64 32`.
- `NEXTAUTH_URL` → leave as `http://localhost:3000` for now; you'll set the
  real one as a Cloudflare secret in step 7.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` → your login.

Apply the database schema and create your admin login, against Neon
directly (this step talks to Neon over a normal Postgres connection, not
through Cloudflare — that's fine, it's a one-time setup command run from
your computer):

```bash
npx prisma migrate deploy
npm run db:seed
```

## 4. Log into Cloudflare from the CLI

```bash
npx wrangler login
```

This opens a browser tab to authorize Wrangler (the Cloudflare CLI, already
installed as part of `npm install`) against your Cloudflare account.

## 5. Create the Hyperdrive config

In the Cloudflare dashboard: **Workers & Pages → Hyperdrive → Create
configuration** (or run the command below). Point it at the *same* Neon
connection string from step 2.

```bash
npx wrangler hyperdrive create amo-crm-db --connection-string="<your Neon connection string>"
```

This prints a Hyperdrive **id** — copy it.

## 6. Wire the Hyperdrive id into the project

Open `wrangler.jsonc` and replace `<HYPERDRIVE_ID>` with the id from step 5:

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "abcd1234...",   // <- from step 5
    "localConnectionString": "postgresql://amo_crm:amo_crm@localhost:5432/amo_crm"
  }
]
```

(`localConnectionString` is only used if you run `wrangler dev` locally
later — point it at any Postgres you have handy for that, or leave it as
a placeholder if you won't use `wrangler dev`.)

## 7. Set your production secrets

These are stored encrypted by Cloudflare, not in your repo:

```bash
npx wrangler secret put AUTH_SECRET
# paste the same value you generated in step 3

npx wrangler secret put ENCRYPTION_KEY
# paste the same value you generated in step 3

npx wrangler secret put NEXTAUTH_URL
# you don't know your final URL yet — for a first deploy, use:
#   https://amo-crm.<your-subdomain>.workers.dev
# (Cloudflare shows you the exact subdomain the first time you deploy;
# you can update this secret afterwards with the real value — see step 9)
```

If you want scheduled auto-sync with systeme.io (optional, see README),
also set:

```bash
npx wrangler secret put CRON_SECRET
```

## 8. Deploy

```bash
npm run cf:deploy
```

This runs `opennextjs-cloudflare build` (adapts the Next.js build for
Workers) and then `opennextjs-cloudflare deploy` (uploads it). When it
finishes, it prints your live URL, something like:

```
https://amo-crm.<your-subdomain>.workers.dev
```

## 9. Fix the URL secret and redeploy (first deploy only)

Now that you know your real URL, update the secret from step 7 to match it
exactly, then redeploy so the Worker picks it up:

```bash
npx wrangler secret put NEXTAUTH_URL
# paste https://amo-crm.<your-subdomain>.workers.dev (no trailing slash)

npm run cf:deploy
```

## 10. Try it

Visit your URL, sign in with the admin email/password from step 3, and
connect systeme.io from **Settings** as described in the main README.

## Redeploying later

Whenever you make code changes:

```bash
npm run cf:deploy
```

Whenever you change your Prisma schema, run `npx prisma migrate deploy`
against Neon (with `DATABASE_URL` in your local `.env` pointed at Neon)
before deploying the new code.

## Using your own domain (optional)

In the Cloudflare dashboard: **Workers & Pages → your Worker → Settings →
Domains & Routes → Add**, and follow the prompts to attach a domain you
manage in Cloudflare. Afterwards, update the `NEXTAUTH_URL` secret (step 7)
to that domain and redeploy.

## Troubleshooting

- **"Error: Not logged in"** when running `wrangler` commands → run
  `npx wrangler login` again.
- **500 errors after deploy, works locally** → double-check the
  `NEXTAUTH_URL` secret matches your actual deployed URL exactly (including
  `https://`, no trailing slash), and that the Hyperdrive `id` in
  `wrangler.jsonc` matches what `wrangler hyperdrive create` printed.
- **"HYPERDRIVE binding not found"** → you deployed before adding the real
  id to `wrangler.jsonc` in step 6; fix it and run `npm run cf:deploy` again.
- Local `wrangler dev` preview needs a real reachable Postgres for
  `localConnectionString` in `wrangler.jsonc` — your Neon URL works fine
  there too.

## Why Neon + Hyperdrive instead of Cloudflare D1?

Cloudflare's own free database, D1, is SQLite — this app's schema uses
Postgres-specific features (enums, case-insensitive search) that would need
rewriting to run on D1. Neon's free Postgres plus Cloudflare's Hyperdrive
(also free) keeps the schema and every query exactly as built, while still
running the whole app on Cloudflare's free plan.
