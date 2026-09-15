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

export class SystemeIoApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SystemeIoApiError";
    this.status = status;
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
        response.status
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
   * NOTE: built from systeme.io's published API conventions (this
   * environment couldn't reach developer.systeme.io to confirm the exact
   * request shape). If updates don't show up as expected in systeme.io, the
   * most likely cause is a field slug mismatch with this account's actual
   * custom field slugs — tell Claude the real slugs (visible in systeme.io
   * under Contacts > Custom fields) and this can be adjusted.
   */
  async updateContactFields(contactId: number, fields: Record<string, string>): Promise<void> {
    const fieldsArray = Object.entries(fields).map(([slug, value]) => ({ slug, value }));
    if (fieldsArray.length === 0) return;
    await this.mutate("PATCH", `/contacts/${contactId}`, { fields: fieldsArray }, "application/merge-patch+json");
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
// If this account's systeme.io fields actually use the other variant, a
// pushed edit will create a new field under this slug instead of updating
// the existing one; adjust these to match if that happens.
export const DEFAULT_PUSH_FIELD_SLUGS: Record<string, string> = {
  firstName: "first_name",
  lastName: "surname",
  phone: "phone_number",
  address: "address",
  city: "city",
  state: "state",
  zip: "zip_code",
  country: "country",
  company: "company",
  website: "website",
};
