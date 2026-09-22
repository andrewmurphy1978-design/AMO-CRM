import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";

interface ShortIoMetadata {
  domain?: string;
  domainFr?: string;
}

export interface ShortIoConfig {
  apiKey: string;
  domain: string;
  domainFr: string | null;
}

// Same storage pattern as every other integration key in this app (see
// src/lib/email-classifier.ts's getStoredApiKey) — encrypted in
// IntegrationSetting rather than a Cloudflare secret, so rotating it is a
// Settings-page paste. The domain(s) aren't secret but ride along in the
// same row's `metadata`, like Make's zone/teamId.
export async function getShortIoConfig(db: PrismaClient): Promise<ShortIoConfig | null> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "shortio" } });
  if (!setting?.apiKeyEncrypted) return null;
  const metadata = (setting.metadata as ShortIoMetadata | null) ?? {};
  if (!metadata.domain) return null;
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);
  return { apiKey, domain: metadata.domain, domainFr: metadata.domainFr ?? null };
}

async function shortIoRequest<T>(url: string, apiKey: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init?.headers,
    },
  });

  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // fall through — data stays {} and the generic error below fires
  }

  if (!response.ok) {
    const parsed = (data ?? {}) as { error?: string; message?: string };
    const message = parsed.error || parsed.message || text.slice(0, 200) || `Short.io returned ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

// https://developers.short.io/reference/linkspost — POST /links with the
// secret key in the Authorization header (no "Bearer" prefix) creates a
// branded short link on one of the account's domains.
export async function createShortIoLink(config: { apiKey: string; domain: string }, originalURL: string): Promise<{ id: string; shortURL: string }> {
  const data = await shortIoRequest<{ id?: string; idString?: string; shortURL?: string }>("https://api.short.io/links", config.apiKey, {
    method: "POST",
    body: JSON.stringify({ domain: config.domain, originalURL }),
  });
  const id = data.id ?? data.idString;
  if (!id || !data.shortURL) throw new Error("Short.io didn't return a link id/URL");
  return { id, shortURL: data.shortURL };
}

// https://developers.short.io/reference/linksby-idpost — updates an
// existing link's destination (and/or other fields) in place.
export async function updateShortIoLink(apiKey: string, linkId: string, updates: { originalURL: string }): Promise<void> {
  await shortIoRequest(`https://api.short.io/links/${linkId}`, apiKey, {
    method: "POST",
    body: JSON.stringify(updates),
  });
}

export interface ShortIoDomain {
  id: string;
  hostname: string;
}

// https://developers.short.io/reference/domainsget — every domain on the account.
export async function listShortIoDomains(apiKey: string): Promise<ShortIoDomain[]> {
  const data = await shortIoRequest<unknown>("https://api.short.io/api/domains", apiKey);
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map((row) => {
      const r = row as { id?: number | string; hostname?: string };
      return r.id != null && r.hostname ? { id: String(r.id), hostname: r.hostname } : null;
    })
    .filter((r): r is ShortIoDomain => r !== null);
}

export interface ShortIoLink {
  // Short.io's list-links response carries both a legacy numeric id and a
  // newer "link_..." string id for the same link. Which one the
  // statistics endpoint actually wants isn't consistent across their own
  // docs revisions, so both are kept and getShortIoLinkStatistics below
  // tries each rather than assuming one.
  id: string;
  idString: string;
  path: string;
  shortURL: string;
  originalURL: string;
}

// https://developers.short.io/reference/linksget — paginated list of every
// link on a domain. Short.io's own pagination cursor field has varied
// across API versions, so this reads a couple of likely shapes and simply
// stops once a page comes back empty or without a usable cursor, rather
// than assuming one exact shape.
export async function listShortIoLinks(apiKey: string, domainId: string): Promise<ShortIoLink[]> {
  const links: ShortIoLink[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page++) {
    const url = new URL("https://api.short.io/api/links");
    url.searchParams.set("domain_id", domainId);
    url.searchParams.set("limit", "150");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await shortIoRequest<{ links?: unknown[]; nextPageToken?: string }>(url.toString(), apiKey);
    const rows = Array.isArray(data.links) ? data.links : [];
    for (const row of rows) {
      const r = row as { id?: number | string; idString?: string; path?: string; shortURL?: string; originalURL?: string };
      const id = r.id != null ? String(r.id) : undefined;
      const idString = r.idString ?? id;
      if ((id || idString) && r.shortURL && r.originalURL) {
        links.push({ id: id ?? idString!, idString: idString ?? id!, path: r.path ?? "", shortURL: r.shortURL, originalURL: r.originalURL });
      }
    }

    if (!data.nextPageToken || rows.length === 0) break;
    pageToken = data.nextPageToken;
  }

  return links;
}

export interface ShortIoStats {
  totalClicks: number | null;
  humanClicks: number | null;
  raw: unknown;
  // Whichever id string actually worked — callers persist this back onto
  // the program so a later single-link "Refresh stats" no longer has to
  // rediscover it.
  matchedId: string;
}

// https://developers.short.io/docs/link-statistics-1 — click totals for one
// link. This lives on a DIFFERENT subdomain than every other endpoint in
// this file (api-v2.short.io, not api.short.io) — every stats request was
// silently 404ing against the wrong host before this, which is why
// shortioClicks never populated for a single program despite link matching
// working fine. Kept as a short list of request variants (legacy numeric id
// vs the newer "link_..." string id, with/without `period=total`) since
// Short.io's own docs have been inconsistent about which one it wants.
export async function getShortIoLinkStatistics(apiKey: string, candidateIds: string[]): Promise<ShortIoStats> {
  const ids = [...new Set(candidateIds.filter(Boolean))];
  let lastError: unknown = new Error("No Short.io link id to check stats for");

  for (const linkId of ids) {
    for (const query of ["?period=total", ""]) {
      try {
        const data = await shortIoRequest<Record<string, unknown>>(`https://api-v2.short.io/statistics/link/${linkId}${query}`, apiKey);
        const totals = (data.totalClicks !== undefined ? data : (data.total as Record<string, unknown>) ?? data) as Record<string, unknown>;
        const totalClicks = typeof totals.totalClicks === "number" ? totals.totalClicks : typeof totals.clicks === "number" ? totals.clicks : null;
        const humanClicks = typeof totals.humanClicks === "number" ? totals.humanClicks : null;
        return { totalClicks, humanClicks, raw: data, matchedId: linkId };
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Short.io statistics request failed");
}
