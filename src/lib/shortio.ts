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

// https://developers.short.io/reference/linkspost — POST /links with the
// secret key in the Authorization header (no "Bearer" prefix) creates a
// branded short link on one of the account's domains.
export async function createShortIoLink(config: { apiKey: string; domain: string }, originalURL: string): Promise<string> {
  const response = await fetch("https://api.short.io/links", {
    method: "POST",
    headers: {
      Authorization: config.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ domain: config.domain, originalURL }),
  });

  const text = await response.text();
  let data: { shortURL?: string; error?: string; message?: string } = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // fall through — data stays {} and the generic error below fires
  }

  if (!response.ok || !data.shortURL) {
    const message = data.error || data.message || text.slice(0, 200) || `Short.io returned ${response.status}`;
    throw new Error(message);
  }

  return data.shortURL;
}
