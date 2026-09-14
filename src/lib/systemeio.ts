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
    let page = 1;
    for (;;) {
      const data = await this.request<unknown>("/contacts", {
        page,
        limit: pageSize,
      });
      const items = extractItems(data).map(mapContact);
      if (items.length === 0) break;
      yield items;
      if (items.length < pageSize) break;
      page += 1;
    }
  }

  async *iterateTags(pageSize = 100): AsyncGenerator<SystemeIoTag[]> {
    let page = 1;
    for (;;) {
      const data = await this.request<unknown>("/tags", { page, limit: pageSize });
      const items = extractItems(data).map(mapTag);
      if (items.length === 0) break;
      yield items;
      if (items.length < pageSize) break;
      page += 1;
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
