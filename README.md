# Andrew Murphy Online CRM

A personalized CRM for Andrew Murphy Online: a contact/client database backed
by a live systeme.io sync, plus Projects (per client) with Tasks.

## Stack

- **Next.js 16** (App Router, TypeScript, Server Actions)
- **Prisma 6** + **PostgreSQL** (via a driver adapter, so it also runs on
  Cloudflare Workers — see [DEPLOY.md](./DEPLOY.md))
- **Auth.js (NextAuth v5)** with email/password login and Admin/Member roles
- **Tailwind CSS 4**

## Features

- **Contacts / Clients** — every systeme.io contact field (email, locale,
  registration date), all systeme.io tags, and every systeme.io custom field
  (common ones like first/last name, phone, company, address get their own
  columns for fast search; anything else is preserved verbatim so no data is
  ever dropped). Contacts can also be added manually. Each contact has a
  lifecycle stage (Lead / Prospect / Client / Past client / Unsubscribed),
  notes, and an activity log.
- **systeme.io sync** — connect your systeme.io public API key in
  **Settings**, then **Sync now** to pull in all contacts, tags, and custom
  field definitions. Optional scheduled auto-sync via a cron trigger (see
  below).
- **Projects** — attached to a client, with status (Planning / Active / On
  hold / Completed / Cancelled), an owner, description, and dates.
- **Tasks** — per project, with status, priority, assignee, and due date.
- **Team** — Admins can invite team members (Admin or Member role) from
  Settings.

## Getting started

### 1. Prerequisites

- Node.js 22+
- A PostgreSQL database (local or hosted — e.g. [Neon](https://neon.tech),
  [Supabase](https://supabase.com), Vercel Postgres, or Docker)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Random secret for NextAuth session encryption — generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | Your app's base URL (`http://localhost:3000` in dev) |
| `ENCRYPTION_KEY` | Random secret used to encrypt your systeme.io API key at rest — generate with `openssl rand -base64 32` |
| `CRON_SECRET` | (Optional) protects the scheduled sync endpoint |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Creates your first admin login when you run the seed script |

### 4. Set up the database

```bash
npx prisma migrate deploy   # apply the schema (use `migrate dev` while developing)
npm run db:seed             # creates your first admin user from SEED_ADMIN_* env vars
```

### 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000/login` and sign in with the admin credentials
from your `.env`. Change your password any time from **Settings → Your
account**.

### 6. Connect systeme.io

1. In systeme.io: **Settings → Public API key** (see
   [systeme.io's docs](https://help.systeme.io/article/2323-how-to-use-systeme-io-public-api)),
   create a key.
2. In the CRM: **Settings → systeme.io integration**, paste the key, **Save
   key**, then **Sync now**.

To keep contacts synced automatically without visiting Settings, a nightly
trigger is already set up via GitHub Actions
(`.github/workflows/nightly-systeme-io-sync.yml`), which calls
`GET /api/cron/systeme-io-sync` with header
`Authorization: Bearer <CRON_SECRET>`. Two one-time steps to turn it on:

1. In the GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, named `CRON_SECRET`, set to the same value used for
   the `CRON_SECRET` Cloudflare Worker secret.
2. In the CRM: **Settings → "Enable scheduled auto-sync"**.

(The workflow runs once around 03:00–04:00 Eastern nightly by default —
adjust the `cron:` line in the workflow file to change the schedule, and use
its "Run workflow" button on GitHub for an on-demand test run.)

Deploying somewhere other than Cloudflare Pages/Workers? On Vercel, use
[Vercel Cron Jobs](https://vercel.com/docs/cron-jobs) instead by adding to
`vercel.json`:

```json
{
  "crons": [{ "path": "/api/cron/systeme-io-sync", "schedule": "0 8 * * *" }]
}
```

> **Note on the systeme.io API shape:** this integration was built from
> systeme.io's published API reference (contacts carry `email`, `locale`,
> `registeredAt`, a `fields` array of custom field values, and a `tags`
> array; auth is an `X-API-Key` header). If your account's API responses use
> slightly different field names, adjust `mapContact` in
> `src/lib/systemeio.ts` — everything downstream (the sync job, the UI)
> consumes its normalized output, so that's the only place to change.

## Data model

- `Contact` — the client/contact record. `systemeIoId` is the sync key;
  contacts created manually in the CRM have no `systemeIoId` until matched.
- `Tag` / `ContactTag` — tags, mirrored from systeme.io or created in the
  CRM.
- `CustomFieldDefinition` / `ContactFieldValue` — every systeme.io custom
  field and its per-contact value, so nothing systeme.io tracks is lost even
  if it isn't one of the promoted columns on `Contact`.
- `Project` — belongs to one `Contact`, has an owner (`User`).
- `Task` — belongs to one `Project`, has an assignee (`User`).
- `User` — team members, `ADMIN` or `MEMBER` role.
- `IntegrationSetting` / `SyncLog` — the encrypted systeme.io API key and
  sync history.

See `prisma/schema.prisma` for the full schema.

## Deployment

**Cloudflare (free plan):** see [DEPLOY.md](./DEPLOY.md) for the full
step-by-step guide — it runs on Cloudflare Workers via
[OpenNext](https://opennext.js.org/cloudflare), with Postgres hosted on
Neon's free tier and bridged in through Cloudflare Hyperdrive.

**Any other Node.js host** (Vercel, Railway, Fly.io, a VPS, etc.) also
works, using the plain `next build` output instead of the Cloudflare-specific
`cf:*` scripts:

1. Provision a Postgres database and set `DATABASE_URL`.
2. Set `AUTH_SECRET`, `NEXTAUTH_URL` (your production URL), `ENCRYPTION_KEY`.
3. Run `npx prisma migrate deploy` against production as part of your deploy
   step.
4. Run `npm run db:seed` once (with `SEED_ADMIN_*` set) to create your first
   login.
5. (Optional) wire up the cron trigger described above for auto-sync.

## Known limitations / follow-ups

- No in-app password reset or "forgot password" flow yet — an admin resets
  a teammate's access by removing and re-adding them.
- The systeme.io sync runs synchronously within the "Sync now" request; very
  large contact lists (many thousands) may need the sync moved to a
  background job/queue if it approaches your host's request timeout.
- `npm audit` reports vulnerabilities inside Prisma's own CLI tooling
  dependency chain (a MySQL driver and a config-merging library Prisma's CLI
  can pull in) — these are dev-time-only dependencies not present in the
  deployed app's runtime bundle.
