import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { EXTRA_STAT_KEYS, todaySocialDateKey, type ExtraStatKey, type SocialLanguage, type SocialPlatform } from "@/lib/social";

// Buffer's GraphQL API (launched 2026, replacing their old REST API) —
// see https://developers.buffer.com/. Its post-metrics support is
// explicitly labeled experimental by Buffer itself, and this session's
// sandbox has no network access to test queries against the real API
// before shipping, so every request here captures the full GraphQL error
// array (and a schema introspection of the failing query) into
// IntegrationSetting.lastSyncError — if the schema below turns out wrong
// in some way, that field will say exactly how, rather than failing silently.
const BUFFER_GRAPHQL_URL = "https://api.buffer.com/graphql";

export class BufferApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BufferApiError";
  }
}

interface BufferChannel {
  id: string;
  name: string;
  service: string; // e.g. "instagram" | "tiktok" | "twitter" | "facebook" | "linkedin"
}

interface BufferMetric {
  type: string;
  name: string;
  value: number;
}

export class BufferClient {
  constructor(private apiKey: string) {}

  private async raw(query: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(BUFFER_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ query, variables }),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  private async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const json = await this.raw(query, variables);
    if (json.errors) {
      const schema = await this.introspectQueryFields().catch((e) => `(introspection failed: ${e})`);
      throw new BufferApiError(
        `Buffer GraphQL error: ${JSON.stringify(json.errors)} | available Query fields: ${JSON.stringify(schema)}`
      );
    }
    if (!json.data) throw new BufferApiError("Buffer API returned no data");
    return json.data as T;
  }

  private async introspectQueryFields(): Promise<unknown> {
    const json = await this.raw(
      `query { __type(name: "Query") { fields { name args { name type { name kind ofType { name } } } } } }`
    );
    const data = json.data as { __type?: { fields?: { name: string }[] } } | undefined;
    return data?.__type?.fields?.map((f) => f.name) ?? json;
  }

  async getOrganizationId(): Promise<string> {
    const data = await this.request<{ account: { organizations: { id: string }[] } }>(
      `query { account { organizations { id } } }`
    );
    const orgId = data.account.organizations[0]?.id;
    if (!orgId) throw new BufferApiError("No organization found for this Buffer API key");
    return orgId;
  }

  async listChannels(organizationId: string): Promise<BufferChannel[]> {
    const data = await this.request<{ channels: BufferChannel[] }>(
      `query GetChannels($organizationId: OrganizationId!) {
        channels(input: { organizationId: $organizationId }) { id name service }
      }`,
      { organizationId }
    );
    return data.channels;
  }

  // Buffer normalizes engagement across networks into a flat list of typed
  // metrics for a set of channels (postCount/reactions/comments always
  // present; reach/impressions/engagementRate — and, on some networks,
  // likes/shares/saves — only when every channel in the set supports them)
  // rather than a fixed set of named fields. Free plans only keep 30 days
  // of analytics history, so that's the window queried here.
  async getAggregatedMetrics(organizationId: string, channelIds: string[]): Promise<BufferMetric[]> {
    if (channelIds.length === 0) return [];
    const endDateTime = new Date();
    const startDateTime = new Date(endDateTime.getTime() - 30 * 24 * 60 * 60 * 1000);
    const data = await this.request<{ aggregatedPostMetrics: { metrics: BufferMetric[] } }>(
      `query GetMetrics($organizationId: OrganizationId!, $channelIds: [ChannelId!]!, $startDateTime: DateTime!, $endDateTime: DateTime!) {
        aggregatedPostMetrics(input: { organizationId: $organizationId, channelIds: $channelIds, startDateTime: $startDateTime, endDateTime: $endDateTime }) {
          metrics { type name value }
        }
      }`,
      { organizationId, channelIds, startDateTime: startDateTime.toISOString(), endDateTime: endDateTime.toISOString() }
    );
    return data.aggregatedPostMetrics.metrics;
  }
}

const SERVICE_TO_PLATFORM: Record<string, SocialPlatform> = {
  instagram: "instagram",
  tiktok: "tiktok",
  twitter: "x",
  facebook: "facebook",
  linkedin: "linkedin",
};

// Andrew's channel names don't follow one single convention across
// platforms — confirmed real examples: "andrewmurphyonline.en" (dot),
// "andrew-murphy-online-francais" (spelled out, no accent), "AMurphyOnlineEN"
// (bare suffix, no separator at all) — so this checks, in order: a
// spelled-out language word, a ".en"/".fr" or "(en)"/"(fr)" marker, then
// finally a bare "en"/"fr" suffix at the very end of the name. Returns
// null when nothing matches, so the caller can log it as a warning
// instead of silently guessing.
function detectLanguageFromChannelName(name: string): SocialLanguage | null {
  const lower = name.toLowerCase();
  if (/fran[cç]ais|french/.test(lower)) return "FR";
  if (/english|anglais/.test(lower)) return "EN";
  if (lower.includes(".fr") || /\(fr\)/.test(lower)) return "FR";
  if (lower.includes(".en") || /\(en\)/.test(lower)) return "EN";
  if (/fr$/.test(lower)) return "FR";
  if (/en$/.test(lower)) return "EN";
  return null;
}

interface BufferAccountConfig {
  provider: string;
  languageMode: "fixed" | "detect";
  fixedLanguage: SocialLanguage | null;
}

// buffer_en/buffer_fr each hold one language's Instagram/TikTok/X
// channels; buffer_fb/buffer_li each hold BOTH languages' channels for
// that one platform, split by channel name (see detectLanguageFromChannelName).
const BUFFER_ACCOUNTS: BufferAccountConfig[] = [
  { provider: "buffer_en", languageMode: "fixed", fixedLanguage: "EN" },
  { provider: "buffer_fr", languageMode: "fixed", fixedLanguage: "FR" },
  { provider: "buffer_fb", languageMode: "detect", fixedLanguage: null },
  { provider: "buffer_li", languageMode: "detect", fixedLanguage: null },
];

type MetricTotals = Partial<Record<ExtraStatKey, number>>;

export interface BufferSyncResult {
  platformsSynced: number;
  accountErrors: { provider: string; message: string }[];
  warnings: string[];
}

export async function runBufferSync(): Promise<BufferSyncResult> {
  return withScopedPrismaClient((db) => runBufferSyncWith(db));
}

async function runBufferSyncWith(db: PrismaClient): Promise<BufferSyncResult> {
  const accounts = await db.integrationSetting.findMany({
    where: { provider: { in: BUFFER_ACCOUNTS.map((a) => a.provider) } },
  });

  // Keyed by "platform|language".
  const totals = new Map<string, MetricTotals>();
  const accountErrors: { provider: string; message: string }[] = [];
  const warnings: string[] = [];

  for (const account of accounts) {
    if (!account.apiKeyEncrypted) continue;
    const config = BUFFER_ACCOUNTS.find((a) => a.provider === account.provider);
    if (!config) continue;

    try {
      const apiKey = await decryptSecret(account.apiKeyEncrypted);
      const client = new BufferClient(apiKey);
      const orgId = await client.getOrganizationId();
      const channels = await client.listChannels(orgId);

      // Group this account's channels by platform+language so each group
      // becomes one aggregatedPostMetrics call.
      const channelIdsByKey = new Map<string, string[]>();
      for (const channel of channels) {
        const platform = SERVICE_TO_PLATFORM[channel.service];
        if (!platform) continue;

        let language: SocialLanguage;
        if (config.languageMode === "fixed" && config.fixedLanguage) {
          language = config.fixedLanguage;
        } else {
          const detected = detectLanguageFromChannelName(channel.name);
          if (!detected) {
            warnings.push(
              `${account.provider}: couldn't tell EN/FR from channel name "${channel.name}" (service ${channel.service}) — defaulted to EN`
            );
          }
          language = detected ?? "EN";
        }

        const key = `${platform}|${language}`;
        const list = channelIdsByKey.get(key) ?? [];
        list.push(channel.id);
        channelIdsByKey.set(key, list);
      }

      for (const [key, channelIds] of channelIdsByKey) {
        const metrics = await client.getAggregatedMetrics(orgId, channelIds);
        const existing = totals.get(key) ?? {};
        for (const metric of metrics) {
          if (!(EXTRA_STAT_KEYS as readonly string[]).includes(metric.type)) continue;
          const statKey = metric.type as ExtraStatKey;
          existing[statKey] = (existing[statKey] ?? 0) + metric.value;
        }
        totals.set(key, existing);
      }

      await db.integrationSetting.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Buffer sync error";
      accountErrors.push({ provider: account.provider, message });
      await db.integrationSetting.update({
        where: { id: account.id },
        data: { lastSyncStatus: "error", lastSyncError: message },
      });
    }
  }

  const dateKey = todaySocialDateKey();
  let platformsSynced = 0;
  for (const [key, stats] of totals) {
    const [platform, language] = key.split("|") as [SocialPlatform, SocialLanguage];
    const reactions = stats.reactions ?? 0;
    const comments = stats.comments ?? 0;
    const likes = stats.likes ?? 0;
    const shares = stats.shares ?? 0;
    const data = {
      engagement: reactions + comments + likes + shares,
      views: stats.reach ?? stats.impressions ?? null,
      raw: stats as never,
      capturedAt: new Date(),
    };
    await db.socialAnalyticsSnapshot.upsert({
      where: { platform_language_dateKey: { platform, language, dateKey } },
      update: data,
      create: { platform, language, dateKey, ...data },
    });
    platformsSynced += 1;
  }

  return { platformsSynced, accountErrors, warnings };
}
