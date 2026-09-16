import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { todaySocialDateKey, type SocialPlatform } from "@/lib/social";

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
  service: string; // e.g. "instagram" | "tiktok" | "twitter"
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
        channels(organizationId: $organizationId) { id name service }
      }`,
      { organizationId }
    );
    return data.channels;
  }

  // Buffer normalizes engagement across networks into a flat list of typed
  // metrics for a set of channels (postCount/reactions/comments always
  // present; reach/impressions/engagementRate only when every channel in
  // the set supports them) rather than a fixed set of named fields.
  async getAggregatedMetrics(channelIds: string[]): Promise<BufferMetric[]> {
    if (channelIds.length === 0) return [];
    const data = await this.request<{ aggregatedPostMetrics: { metrics: BufferMetric[] } }>(
      `query GetMetrics($channelIds: [ChannelId!]!) {
        aggregatedPostMetrics(channelIds: $channelIds) {
          metrics { type name value }
        }
      }`,
      { channelIds }
    );
    return data.aggregatedPostMetrics.metrics;
  }
}

const SERVICE_TO_PLATFORM: Record<string, SocialPlatform> = {
  instagram: "instagram",
  tiktok: "tiktok",
  twitter: "x",
};

export interface BufferSyncResult {
  platformsSynced: number;
  accountErrors: { provider: string; message: string }[];
}

// Andrew runs two Buffer accounts (English + French), each posting to
// Instagram/TikTok/X for that language — this sums both languages'
// metrics into one snapshot per platform, since the Dashboard tracks
// overall reach per platform rather than per language.
export async function runBufferSync(): Promise<BufferSyncResult> {
  return withScopedPrismaClient((db) => runBufferSyncWith(db));
}

const BUFFER_PROVIDERS = ["buffer_en", "buffer_fr"] as const;

async function runBufferSyncWith(db: PrismaClient): Promise<BufferSyncResult> {
  const accounts = await db.integrationSetting.findMany({
    where: { provider: { in: [...BUFFER_PROVIDERS] } },
  });

  const totals = new Map<SocialPlatform, { reactions: number; comments: number; postCount: number; reach: number | null }>();
  const accountErrors: { provider: string; message: string }[] = [];

  for (const account of accounts) {
    if (!account.apiKeyEncrypted) continue;
    try {
      const apiKey = await decryptSecret(account.apiKeyEncrypted);
      const client = new BufferClient(apiKey);
      const orgId = await client.getOrganizationId();
      const channels = await client.listChannels(orgId);

      const channelIdsByPlatform = new Map<SocialPlatform, string[]>();
      for (const channel of channels) {
        const platform = SERVICE_TO_PLATFORM[channel.service];
        if (!platform) continue;
        const list = channelIdsByPlatform.get(platform) ?? [];
        list.push(channel.id);
        channelIdsByPlatform.set(platform, list);
      }

      for (const [platform, channelIds] of channelIdsByPlatform) {
        const metrics = await client.getAggregatedMetrics(channelIds);
        const reactions = metrics.find((m) => m.type === "reactions")?.value ?? 0;
        const comments = metrics.find((m) => m.type === "comments")?.value ?? 0;
        const postCount = metrics.find((m) => m.type === "postCount")?.value ?? 0;
        const reach = metrics.find((m) => m.type === "reach" || m.type === "impressions")?.value ?? null;

        const existing = totals.get(platform) ?? { reactions: 0, comments: 0, postCount: 0, reach: null };
        totals.set(platform, {
          reactions: existing.reactions + reactions,
          comments: existing.comments + comments,
          postCount: existing.postCount + postCount,
          reach: reach === null ? existing.reach : (existing.reach ?? 0) + reach,
        });
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
  for (const [platform, { reactions, comments, postCount, reach }] of totals) {
    const data = {
      engagement: reactions + comments,
      views: reach,
      raw: { postCount, reactions, comments, reach } as never,
      capturedAt: new Date(),
    };
    await db.socialAnalyticsSnapshot.upsert({
      where: { platform_dateKey: { platform, dateKey } },
      update: data,
      create: { platform, dateKey, ...data },
    });
    platformsSynced += 1;
  }

  return { platformsSynced, accountErrors };
}
