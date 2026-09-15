// Client for the systeme.io public API (https://developer.systeme.io/reference).
//
// NOTE: this session's network access could not reach developer.systeme.io to
// pull the live schema, so the shapes below are based on systeme.io's published
// API description (contacts carry email/locale/registered_at, a `fields` array
// of { slug, value } custom fields, and a `tags` array; auth is an `X-API-Key`
// header; list endpoints are paginated). The collection envelope is parsed
// defensively (see `extractItems`/`extractTotal` below) so a real account's
// exact response shape won't break the sync — if systeme.io's field names turn
// out to differ, adjust the `mapContact` function below; everything else in the
// app consumes its normalized output.

const API_BASE_URL = "https://api.systeme.io/api";

export interface SystemeIoTag {
  id: number;
  name: string;
}

export interface SystemeIoCustomFieldValue {
  slug: string;
  value: string | number | boolean | null;
}

export interface SystemeIoContact {
  id: number;
  email: string;
  locale?: string | null;
  registeredAt?: string | null;
  fields: SystemeIoCustomFieldValue[];
  tags: SystemeIoTag[];
}

export interface SystemeIoCustomFieldDefinition {
  slug: string;
  label: string;
  type?: string | null;
}

// The three interfaces below (Subscription, CourseEnrollment,
// CommunityMembership) cover systeme.io resource categories the public API
// docs list by name only — no documented response field names, unlike
// Contacts/Tags above. Each keeps the full `raw` payload alongside a few
// defensively extracted common fields (tried under several likely key
// names/casings); if a field comes back wrong or missing for this account's
// real data, `raw` still has everything needed to fix the extraction below.
export interface SystemeIoSubscription {
  id: number;
  contactSystemeIoId: number | null;
  status: string | null;
  planName: string | null;
  amount: number | null;
  currency: string | null;
  startedAt: string | null;
  canceledAt: string | null;
  raw: Record<string, unknown>;
}

export interface SystemeIoEnrollment {
  id: number;
  contactSystemeIoId: number | null;
  courseName: string | null;
  status: string | null;
  enrolledAt: string | null;
  raw: Record<string, unknown>;
}

export interface SystemeIoCommunityMembership {
  id: number;
  contactSystemeIoId: number | null;
  communityName: string | null;
  status: string | null;
  joinedAt: string | null;
  raw: Record<string, unknown>;
}

export class SystemeIoApiError extends Error {
  status: number;
  /** Full, untruncated response body — `message` is truncated for display. */
  body: string;
  constructor(message: string, status: number, body = "") {
    super(message);
    this.name = "SystemeIoApiError";
    this.status = status;
    this.body = body;
  }
}

export class SystemeIoClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const url = new URL(`${API_BASE_URL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        "X-API-Key": this.apiKey,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new SystemeIoApiError(
        `systeme.io API request to ${path} failed with ${response.status}: ${body.slice(0, 300)}`,
        response.status
      );
    }

    return (await response.json()) as T;
  }

  // Write requests (create/update/delete). Unlike `request`, systeme.io's
  // write endpoints commonly reply with an empty 204 body, so this doesn't
  // assume a JSON response.
  private async mutate<T = void>(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    contentType = "application/json"
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "X-API-Key": this.apiKey,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": contentType } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new SystemeIoApiError(
        `systeme.io API request to ${method} ${path} failed with ${response.status}: ${text.slice(0, 300)}`,
        response.status,
        text
      );
    }

    const text = await response.text().catch(() => "");
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * Pushes contact field edits made in the CRM back to systeme.io.
   * `fields` keys must be systeme.io custom-field slugs (see
   * DEFAULT_PUSH_FIELD_SLUGS below) — NOT our own column names.
   *
   * systeme.io rejects the *entire* PATCH if any one field's slug doesn't
   * exist on this account or its value isn't a valid choice for a
   * select-type field (422, with a per-field `fields[N].slug`/`fields[N].value`
   * message). Rather than losing every field over one bad one, this parses
   * the rejected indexes out of the error body, drops just those fields, and
   * retries — so e.g. a stale "country" value doesn't also block "city" and
   * "state" from saving. Returns the slugs that had to be dropped so the
   * caller can tell the user which fields didn't make it to systeme.io.
   */
  async updateContactFields(contactId: number, fields: Record<string, string>): Promise<{ skipped: string[] }> {
    const fieldsArray = Object.entries(fields).map(([slug, value]) => ({ slug, value }));
    const skipped: string[] = [];

    while (fieldsArray.length > 0) {
      try {
        await this.mutate("PATCH", `/contacts/${contactId}`, { fields: fieldsArray }, "application/merge-patch+json");
        return { skipped };
      } catch (error) {
        if (!(error instanceof SystemeIoApiError) || error.status !== 422) throw error;
        const badIndexes = [...new Set([...error.body.matchAll(/fields\[(\d+)\]/g)].map((m) => Number(m[1])))];
        if (badIndexes.length === 0) throw error;
        for (const index of badIndexes.sort((a, b) => b - a)) {
          const bad = fieldsArray[index];
          if (bad) skipped.push(bad.slug);
          fieldsArray.splice(index, 1);
        }
      }
    }

    return { skipped };
  }

  async addTagToContact(contactId: number, tagId: number): Promise<void> {
    await this.mutate("POST", `/contacts/${contactId}/tags`, { tagId });
  }

  async removeTagFromContact(contactId: number, tagId: number): Promise<void> {
    await this.mutate("DELETE", `/contacts/${contactId}/tags/${tagId}`);
  }

  async createTag(name: string): Promise<SystemeIoTag> {
    const data = await this.mutate<Record<string, unknown>>("POST", "/tags", { name });
    return mapTag(data);
  }

  /** Confirms the API key is valid by requesting one page of contacts. */
  async verifyApiKey(): Promise<boolean> {
    try {
      await this.request("/contacts", { limit: 1 });
      return true;
    } catch (error) {
      if (error instanceof SystemeIoApiError && (error.status === 401 || error.status === 403)) {
        return false;
      }
      throw error;
    }
  }

  async *iterateContacts(pageSize = 100): AsyncGenerator<SystemeIoContact[]> {
    yield* this.paginate("/contacts", mapContact, pageSize);
  }

  async *iterateTags(pageSize = 100): AsyncGenerator<SystemeIoTag[]> {
    yield* this.paginate("/tags", mapTag, pageSize);
  }

  // systeme.io uses cursor-based pagination (startingAfter = last item's id,
  // hasMore in the response), not page numbers — confirmed against their
  // public API docs. Stops once hasMore is false or a page comes back empty.
  private async *paginate<T>(
    path: string,
    mapper: (raw: Record<string, unknown>) => T,
    pageSize: number
  ): AsyncGenerator<T[]> {
    let startingAfter: string | number | undefined;
    for (;;) {
      const params: Record<string, string | number> = { limit: pageSize, order: "asc" };
      if (startingAfter !== undefined) params.startingAfter = startingAfter;

      const data = await this.request<unknown>(path, params);
      const rawItems = extractItems(data);
      if (rawItems.length === 0) break;

      yield rawItems.map(mapper);

      const hasMore = Boolean((data as Record<string, unknown>)?.hasMore);
      const lastId = rawItems[rawItems.length - 1]?.id as string | number | undefined;
      if (!hasMore || lastId === undefined) break;
      startingAfter = lastId;
    }
  }

  async listCustomFieldDefinitions(): Promise<SystemeIoCustomFieldDefinition[]> {
    const data = await this.request<unknown>("/contact_fields", { limit: 200 });
    return extractItems(data).map(mapCustomFieldDefinition);
  }

  async *iterateSubscriptions(pageSize = 100): AsyncGenerator<SystemeIoSubscription[]> {
    yield* this.paginate("/subscriptions", mapSubscription, pageSize);
  }

  async *iterateEnrollments(pageSize = 100): AsyncGenerator<SystemeIoEnrollment[]> {
    yield* this.paginate("/enrollments", mapEnrollment, pageSize);
  }

  async *iterateCommunityMemberships(pageSize = 100): AsyncGenerator<SystemeIoCommunityMembership[]> {
    yield* this.paginate("/community_memberships", mapCommunityMembership, pageSize);
  }
}

// --- Response parsing helpers -----------------------------------------------
// systeme.io's API is built on API Platform, which typically returns either a
// bare JSON array, a `{ items: [...] }` envelope, or a Hydra collection
// (`{ "hydra:member": [...] }`). We accept all three shapes.

function extractItems(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
    if (Array.isArray(obj["hydra:member"])) {
      return obj["hydra:member"] as Record<string, unknown>[];
    }
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
  }
  return [];
}

function mapContact(raw: Record<string, unknown>): SystemeIoContact {
  const fieldsRaw = Array.isArray(raw.fields) ? raw.fields : [];
  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];

  return {
    id: Number(raw.id),
    email: String(raw.email ?? ""),
    locale: (raw.locale as string | undefined) ?? null,
    registeredAt: (raw.registeredAt as string | undefined) ??
      (raw.registered_at as string | undefined) ??
      null,
    fields: fieldsRaw.map((f) => {
      const field = f as Record<string, unknown>;
      return {
        slug: String(field.slug ?? field.field ?? ""),
        value: (field.value as string | number | boolean | null) ?? null,
      };
    }),
    tags: tagsRaw.map(mapTag),
  };
}

function mapTag(raw: unknown): SystemeIoTag {
  const tag = raw as Record<string, unknown>;
  return {
    id: Number(tag.id),
    name: String(tag.name ?? ""),
  };
}

// Tries several likely key names/casings for the same logical field, since
// the exact shape of these resources isn't documented.
function pick(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key];
  }
  return null;
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  const value = pick(raw, keys);
  return value === null ? null : String(value);
}

function pickNumber(raw: Record<string, unknown>, keys: string[]): number | null {
  const value = pick(raw, keys);
  if (value === null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

// The related contact typically comes back either as a bare id
// (`contactId`/`contact_id`), or a nested object (`contact: { id }` /
// `customer: { id }`).
function pickContactId(raw: Record<string, unknown>): number | null {
  const direct = pickNumber(raw, ["contactId", "contact_id", "customerId", "customer_id"]);
  if (direct !== null) return direct;
  for (const key of ["contact", "customer"]) {
    const nested = raw[key];
    if (nested && typeof nested === "object") {
      const id = (nested as Record<string, unknown>).id;
      if (id !== undefined && id !== null) {
        const num = Number(id);
        if (!Number.isNaN(num)) return num;
      }
    }
  }
  return null;
}

function mapSubscription(raw: Record<string, unknown>): SystemeIoSubscription {
  const plan = raw.plan ?? raw.pricePlan ?? raw.price_plan;
  const planName =
    pickString(raw, ["planName", "plan_name"]) ??
    (plan && typeof plan === "object" ? pickString(plan as Record<string, unknown>, ["name", "title"]) : null);
  const planAmount = plan && typeof plan === "object" ? pickNumber(plan as Record<string, unknown>, ["amount", "price"]) : null;

  return {
    id: Number(raw.id),
    contactSystemeIoId: pickContactId(raw),
    status: pickString(raw, ["status", "state"]),
    planName,
    amount: pickNumber(raw, ["amount", "price"]) ?? planAmount,
    currency: pickString(raw, ["currency", "currencyCode", "currency_code"]),
    startedAt: pickString(raw, ["startedAt", "started_at", "createdAt", "created_at"]),
    canceledAt: pickString(raw, ["canceledAt", "canceled_at", "cancelledAt", "cancelled_at"]),
    raw,
  };
}

function mapEnrollment(raw: Record<string, unknown>): SystemeIoEnrollment {
  const course = raw.course;
  const courseName =
    pickString(raw, ["courseName", "course_name"]) ??
    (course && typeof course === "object" ? pickString(course as Record<string, unknown>, ["name", "title"]) : null);

  return {
    id: Number(raw.id),
    contactSystemeIoId: pickContactId(raw),
    courseName,
    status: pickString(raw, ["status", "state"]),
    enrolledAt: pickString(raw, ["enrolledAt", "enrolled_at", "createdAt", "created_at"]),
    raw,
  };
}

function mapCommunityMembership(raw: Record<string, unknown>): SystemeIoCommunityMembership {
  const community = raw.community;
  const communityName =
    pickString(raw, ["communityName", "community_name"]) ??
    (community && typeof community === "object" ? pickString(community as Record<string, unknown>, ["name", "title"]) : null);

  return {
    id: Number(raw.id),
    contactSystemeIoId: pickContactId(raw),
    communityName,
    status: pickString(raw, ["status", "state"]),
    joinedAt: pickString(raw, ["joinedAt", "joined_at", "createdAt", "created_at"]),
    raw,
  };
}

function mapCustomFieldDefinition(raw: Record<string, unknown>): SystemeIoCustomFieldDefinition {
  return {
    slug: String(raw.slug ?? ""),
    label: String(raw.label ?? raw.name ?? raw.slug ?? ""),
    type: (raw.type as string | undefined) ?? null,
  };
}

// Common systeme.io custom field slugs that we promote to first-class Contact
// columns for fast search/sort. Anything not in this map is still preserved
// verbatim in ContactFieldValue.
export const PROMOTED_FIELD_SLUGS: Record<string, string> = {
  first_name: "firstName",
  surname: "lastName",
  last_name: "lastName",
  phone_number: "phone",
  phone: "phone",
  address: "address",
  city: "city",
  state: "state",
  zip_code: "zip",
  zip: "zip",
  country: "country",
  company: "company",
  website: "website",
};

// The reverse of the above, for pushing CRM edits back to systeme.io. Some
// columns above accept more than one systeme.io slug (e.g. "surname" or
// "last_name" both map to lastName) — this picks one default to write to.
// Confirmed 2026-09 against this account's actual custom field slugs (via
// the synced CustomFieldDefinition table): "street_address" not "address",
// "postcode" not "zip_code", "company_name" not "company". There is no
// "website" field on this account at all, so it isn't pushed — an edit to
// it only lives in the CRM's own database.
export const DEFAULT_PUSH_FIELD_SLUGS: Record<string, string> = {
  firstName: "first_name",
  lastName: "surname",
  phone: "phone_number",
  address: "street_address",
  city: "city",
  state: "state",
  zip: "postcode",
  country: "country",
  company: "company_name",
};
