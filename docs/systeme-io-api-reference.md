# Systeme.io Public API — Reference

Source: https://developer.systeme.io/reference/api (fetched via browser, Sept 2026)
Compiled for: Andrew Murphy Online — funnel/lead automation between ClickFunnels and Systeme.io

---

## 1. Overview

Systeme.io's Public API is a RESTful API for managing contacts, tags, funnels, mailing campaigns, courses, payments, webhooks, and more.

- **Base URL:** `https://api.systeme.io/api`
- **Docs root:** `https://developer.systeme.io/reference/api`

## 2. Authentication

- Generate a key in the Systeme.io dashboard: **Profile Settings → Public API keys**
- Attach it to every request via header:
  ```
  X-API-Key: your_api_key
  ```
- ⚠️ **Security warning from the docs:** never call this API from a public/client-side page (browser JS on a live site) — it exposes your key. Always call it from a server-side environment (a backend script, serverless function, n8n/Make/Zapier server-side node, etc.) to avoid CORS issues and key leakage.
- Only one auth method currently supported (API key header). No OAuth as of this writing.

## 3. Rate Limiting

- Response headers on every call:
  - `X-RateLimit-Limit` — max requests allowed per window
  - `X-RateLimit-Remaining` — requests left in current window
  - `X-RateLimit-Refill` — when the next quota refill happens
- Limit is **shared across all your API keys/tokens** — not per-key.
- Exceeding it returns `429 Too Many Requests` with a `Retry-After` header (seconds to wait).
- Build retry/backoff logic around `Retry-After`.

## 4. Pagination (cursor-based)

Used on all collection (`GET .../resource`) endpoints.

| Param | Type | Notes |
|---|---|---|
| `startingAfter` | integer | ID of the last item from the previous page. Omit on first request. Never guess or use `0`. |
| `limit` | integer | 10–100 per page. |
| `order` | `asc` \| `desc` | Default `desc`. |

Response shape:
```json
{
  "items": [ ... ],
  "hasMore": true
}
```
Loop: keep requesting with `startingAfter = last item's id` while `hasMore` is `true`.

## 5. Partial Updates (PATCH)

Endpoints marked `PATCH` use `Content-Type: application/merge-patch+json`. Only send the fields you want to change; omitted fields are left alone. Sending a field as `null` clears it.

Example — update a contact's country and clear their phone number:
```json
{
  "locale": "en",
  "fields": [
    { "slug": "country", "value": "US" },
    { "slug": "phone_number", "value": null }
  ]
}
```

`PUT` endpoints (e.g. Tags) fully **replace** the resource — send all required fields every time.

---

## 6. Contacts

### `GET /api/contacts` — list contacts
Query params:
| Param | Type | Description |
|---|---|---|
| `email` | string | Filter by exact email |
| `tags` | string | Comma-separated tag IDs; returns contacts having **all** listed tags |
| `bounced` | boolean | Filter by bounced state |
| `unsubscribed` | boolean | Filter by unsubscribed state |
| `needsConfirmation` | boolean | Filter by confirmation-pending state |
| `registeredBefore` | date-time | Registered before this date |
| `registeredAfter` | date-time | Registered after this date |
| `limit`, `startingAfter`, `order` | — | Standard pagination (see §4) |

Responses: `200` collection, `429` rate limited.

### `POST /api/contacts` — create contact
Body:
```json
{
  "email": "lead@example.com",
  "locale": "fr",
  "fields": [
    { "slug": "country", "value": "CA" }
  ]
}
```
- `locale`: enum, 28 values (en, fr, es, it, pt, de, nl, ru, jp, tr, ar, zh, sv, ro, cs, hu, sk, dk, id, pl, el, sr, hi, no, th, sq, sl, ua, …)
- `fields`: array of `{slug, value}` — custom contact fields. Country field expects a 2-letter ISO 3166 code.
- ⚠️ Note: contacts aren't purged immediately on delete (can take several days). A new contact created with the same email as a recently-deleted one may inherit some old properties.

Responses: `201` created, `400` invalid input, `422` unprocessable, `429` rate limited.

### `GET /api/contacts/{id}` — retrieve one contact
Path: `id` (required). Responses: `200`, `404`, `429`.

### `PATCH /api/contacts/{id}` — update contact
Same body shape as POST (locale, fields[]), merge-patch semantics. Responses: `200`, `400`, `404`, `422`, `429`.

### `DELETE /api/contacts/{id}` — delete contact
Responses: `204` deleted, `404`, `429`.

### `POST /api/contacts/{id}/tags` — assign tag to contact
Body: `{ "tagId": 123 }` (integer, required). Responses: `204`, `400`, `422`, `429`.

### `DELETE /api/contacts/{id}/tags/{tagId}` — remove tag from contact
Path params: `id` (int ≥1), `tagId` (int ≥1). Responses: `204`, `404`, `429`.

---

## 7. Tags

### `GET /api/tags` — list tags
Query: `query` (text search), plus standard pagination (`limit`, `startingAfter`, `order`). Responses: `200`, `429`.

### `POST /api/tags` — create tag
Body: `{ "name": "NewTagName" }` (string, required, ≤64 chars). Responses: `201`, `400`, `422`, `429`.

### `GET /api/tags/{id}` — retrieve tag
Responses: `200`, `404`, `429`.

### `PUT /api/tags/{id}` — replace tag (full update)
Body: `{ "name": "UpdatedName" }` (required, ≤64 chars). Responses: `200`, `400`, `404`, `422`, `429`.

### `DELETE /api/tags/{id}` — delete tag
Responses: `204`, `404`, `429`.

---

## 8. Contact Fields (custom fields)

### `GET /api/contact_fields` — list custom field definitions
Responses: `200`, `429`.

### `POST /api/contact_fields` — create custom field
Body:
```json
{ "fieldName": "Referral Source", "slug": "referral_source" }
```
- `fieldName`: string, required, ≤255 chars
- `slug`: string, required, pattern `^(\w+)$` (word characters only, no spaces/dashes)

Responses: `201`, `400`, `422`, `429`.

### `PATCH /api/contact_fields/{slug}` — update custom field
Body: `{ "fieldName": "New Label" }` (required, ≤255). Responses: `200`, `400`, `404`, `422`, `429`.

### `DELETE /api/contact_fields/{slug}` — delete custom field
Responses: `204`, `404`, `429`.

---

## 9. Webhooks

### `GET /api/webhooks` — list webhooks
Responses: `200`, `429`.

### `POST /api/webhooks` — create webhook
Body:
```json
{
  "name": "New Lead Notifier",
  "secret": "your_shared_secret",
  "url": "https://your-server.com/webhook-endpoint",
  "subscriptions": ["contact.created"],
  "active": true
}
```
- `name`: string, required, ≤255 chars
- `secret`: string, required — used to sign/verify payloads on your receiving end
- `url`: string (URI), required — your endpoint
- `subscriptions`: array, required — event names to subscribe to (the interactive docs UI has a picker for these; the exact enum list wasn't fully readable in the static export — check the "Creates a Webhook resource" page's dropdown in-app, or start with a broad guess like `contact.created`, `contact.tag_added`, `contact.updated`, `sale.created` and verify by testing)
- `active`: boolean | null

Responses: `201`, `400`, `422`, `429`.

### `GET /api/webhooks/{id}` — retrieve webhook
Responses: `200`, `404`, `429`.

### `PATCH /api/webhooks/{id}` — update webhook
Body: `name`, `secret`, `subscriptions`, `active` — all optional/nullable, merge-patch. Responses: `200`, `400`, `404`, `422`, `429`.

### `DELETE /api/webhooks/{id}` — delete webhook
(listed in nav; not individually fetched — follows same pattern as other DELETEs: `204`/`404`/`429`)

---

## 10. Other Resource Categories (endpoints exist, not detailed here)

The API also covers these resource groups — same auth/pagination/PATCH conventions apply. Fetch the specific page on developer.systeme.io/reference/ if/when you need exact bodies:

- **Automation Rules** — `automationrules` (get collection, post, get one, delete, patch)
- **Booking Calendar** — bookings, calendar events, user availability
- **Community** — communities, memberships
- **Funnels** — funnels list/create, funnel steps
- **Mailing** — newsletters (create/update/schedule/send/send test), campaigns, campaign steps, automation emails (incl. "to specific address" variant), excluded/included tag targeting
- **Page Editor** — save page, page schema
- **Payment** — coupons, price plans, digital products, physical products, offers, sale settings (with currency-specific payment methods), subscriptions (incl. cancel)
- **SMS Templates**
- **School** — courses, course themes, course modules, lectures, enrollments, activate/deactivate course & lecture
- **Domains**, **Files**

---

## 11. Quick-Start Code Examples (from official docs)

**Create a tag (curl):**
```bash
curl -X POST 'https://api.systeme.io/api/tags' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: your_api_key' \
  -d '{"name": "NewTagName"}'
```

**List contacts (JavaScript fetch):**
```javascript
fetch('https://api.systeme.io/api/contacts', {
  headers: { 'X-API-Key': 'your_api_key' }
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));
```

---

## 12. Practical Notes for This Project (Andrew Murphy Online)

Likely use cases to build against this API:
- **Lead sync:** push new leads captured elsewhere (e.g. ClickFunnels forms, TikTok/social lead ads) into Systeme.io as Contacts, tagged by source/campaign/language (EN vs FR) via `POST /contacts` + `POST /contacts/{id}/tags`.
- **Segmentation:** use custom Contact Fields (`contact_fields`) to track things like funnel-of-origin, language, or lead magnet downloaded.
- **Automation triggers:** use Webhooks to notify an external system (e.g. Make/Zapier/your own backend) the moment a contact is created or tagged, to kick off cross-platform automations (e.g. add to a CRM, notify you on a new hot lead).
- **Bilingual handling:** the `locale` field on contacts supports `fr` and `en` — use this to segment/trigger French vs English email sequences.
- Because the key must stay server-side, any integration should run through a backend (a small Node/Python service, a Cloudflare Worker, or an automation platform like Make/Zapier) — never embed the key in a ClickFunnels page's custom HTML/JS.
