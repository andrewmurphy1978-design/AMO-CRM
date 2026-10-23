import type { PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { SocialLanguage, SocialPlatform } from "@/lib/social";
import {
  BufferClient,
  BUFFER_ACCOUNTS,
  EXCLUDED_CHANNEL_NAMES,
  SERVICE_TO_PLATFORM,
  detectLanguageFromChannelName,
  type SchemaType,
  type TypeRef,
} from "@/lib/buffer";

// Recent posts (sent and queued) from Buffer's GraphQL API. Buffer's public schema is new and partly preview, and could
// not be read from where this was written, so the queries are BUILT FROM THE LIVE SCHEMA: the field names, the filter
// shape and the status values are looked up with introspection each time instead of being assumed. When something
// does not line up, the error says what Buffer actually offers (and "Check Buffer API fields" in the Posts tab shows
// the relevant parts of the schema).

const named = (t: TypeRef | null): TypeRef | null => {
  let x = t;
  while (x && !x.name) x = x.ofType;
  return x;
};
const isList = (t: TypeRef | null): boolean => {
  for (let x = t; x; x = x.ofType) if (x.kind === "LIST") return true;
  return false;
};
const typeString = (t: TypeRef): string => (t.kind === "NON_NULL" ? `${typeString(t.ofType as TypeRef)}!` : t.kind === "LIST" ? `[${typeString(t.ofType as TypeRef)}]` : (t.name ?? "String"));

class Schema {
  private cache = new Map<string, SchemaType | null>();
  constructor(private client: BufferClient) {}
  async get(name: string | null | undefined): Promise<SchemaType | null> {
    if (!name) return null;
    if (!this.cache.has(name)) this.cache.set(name, await this.client.typeInfo(name));
    return this.cache.get(name) ?? null;
  }
}

export type PostStatus = "SENT" | "QUEUED";

function pickEnum(values: string[], status: PostStatus): string | null {
  const exact = status === "SENT" ? /^(sent|published)$/i : /^(scheduled|queued|pending)$/i;
  const loose = status === "SENT" ? /sent|publish/i : /sched|queue|pend/i;
  return values.find((v) => exact.test(v)) ?? values.find((v) => loose.test(v)) ?? null;
}

interface Ctx { orgId: string; channelIds: string[]; status: PostStatus; statusApplied: boolean }

async function fillInput(schema: Schema, typeName: string, ctx: Ctx, depth = 0): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const t = await schema.get(typeName);
  for (const f of t?.inputFields ?? []) {
    const nt = named(f.type);
    const list = isList(f.type);
    if (/^organizationId$/i.test(f.name)) out[f.name] = ctx.orgId;
    else if (/^channelIds?$/i.test(f.name)) {
      if (list) out[f.name] = ctx.channelIds;
    } else if (/^(status|statuses|state)$/i.test(f.name) && nt?.kind === "ENUM") {
      const v = pickEnum(((await schema.get(nt.name))?.enumValues ?? []).map((e) => e.name), ctx.status);
      if (v) {
        out[f.name] = list ? [v] : v;
        ctx.statusApplied = true;
      }
    } else if (/^(first|limit|pageSize|count|perPage)$/i.test(f.name) && nt?.name === "Int") out[f.name] = 50;
    else if (nt?.kind === "INPUT_OBJECT" && depth < 3 && /filter|where|criteria|query/i.test(f.name)) out[f.name] = await fillInput(schema, nt.name as string, ctx, depth + 1);
  }
  return out;
}

const SCALAR_WANTED = new Set(["id", "text", "content", "status", "dueAt", "scheduledAt", "sentAt", "publishedAt", "createdAt", "externalLink", "link", "url", "channelId", "channelService"]);

async function metricsSelection(schema: Schema, t: TypeRef | null): Promise<string | null> {
  const mt = await schema.get(named(t)?.name);
  if (!mt?.fields) return null;
  const parts: string[] = [];
  for (const f of mt.fields) {
    const nt = named(f.type);
    if (nt?.kind === "SCALAR" || nt?.kind === "ENUM") parts.push(f.name);
    else if (nt?.kind === "OBJECT" && /metrics|items|values|data/i.test(f.name)) {
      const inner = await schema.get(nt.name);
      const sub = (inner?.fields ?? []).filter((x) => ["SCALAR", "ENUM"].includes(named(x.type)?.kind ?? "")).map((x) => x.name);
      if (sub.length) parts.push(`${f.name} { ${sub.join(" ")} }`);
    }
  }
  return parts.length ? parts.slice(0, 20).join(" ") : null;
}

async function postSelection(schema: Schema, postType: SchemaType): Promise<string> {
  const parts: string[] = [];
  for (const f of postType.fields ?? []) {
    const nt = named(f.type);
    if ((nt?.kind === "SCALAR" || nt?.kind === "ENUM") && SCALAR_WANTED.has(f.name)) parts.push(f.name);
    else if (f.name === "channel" && nt?.kind === "OBJECT") {
      const ch = await schema.get(nt.name);
      const sub = (ch?.fields ?? []).filter((x) => ["id", "name", "service"].includes(x.name)).map((x) => x.name);
      if (sub.length) parts.push(`channel { ${sub.join(" ")} }`);
    } else if (f.name === "metrics") {
      const m = await metricsSelection(schema, f.type);
      if (m) parts.push(`metrics { ${m} }`);
    }
  }
  if (!parts.includes("id")) throw new Error(`Buffer's ${postType.name} type has no id field (it offers: ${(postType.fields ?? []).map((f) => f.name).join(", ")})`);
  return parts.join(" ");
}

export interface BufferPost { id: string; statusRaw: string; text: string | null; link: string | null; postedAt: string | null; channelId: string | null; metrics: Record<string, number> }

function normMetrics(m: unknown, out: Record<string, number> = {}): Record<string, number> {
  if (Array.isArray(m)) {
    for (const x of m) {
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const key = typeof o.type === "string" ? o.type : typeof o.name === "string" ? o.name : null;
        if (key && Number.isFinite(Number(o.value))) out[key] = Number(o.value);
        else normMetrics(o, out);
      }
    }
  } else if (m && typeof m === "object") {
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      else if (v && typeof v === "object") normMetrics(v, out);
    }
  }
  return out;
}

export async function fetchBufferPosts(client: BufferClient, orgId: string, channelIds: string[], status: PostStatus): Promise<{ posts: BufferPost[]; statusApplied: boolean }> {
  const schema = new Schema(client);
  const root = await schema.get("Query");
  const field = root?.fields?.find((f) => f.name === "posts");
  if (!field) throw new Error(`Buffer's API has no "posts" query (it offers: ${(root?.fields ?? []).map((f) => f.name).join(", ")})`);

  const ctx: Ctx = { orgId, channelIds, status, statusApplied: false };
  const decls: string[] = [];
  const uses: string[] = [];
  const variables: Record<string, unknown> = {};
  let i = 0;
  for (const a of field.args ?? []) {
    const nt = named(a.type);
    let value: unknown;
    if (nt?.kind === "INPUT_OBJECT") value = await fillInput(schema, nt.name as string, ctx);
    else if (/^organizationId$/i.test(a.name)) value = orgId;
    else if (/^channelIds?$/i.test(a.name) && isList(a.type)) value = channelIds;
    else if (/^(first|limit|pageSize)$/i.test(a.name) && nt?.name === "Int") value = 50;
    else if (/^(status|statuses)$/i.test(a.name) && nt?.kind === "ENUM") {
      const v = pickEnum(((await schema.get(nt.name))?.enumValues ?? []).map((e) => e.name), status);
      if (v) {
        value = isList(a.type) ? [v] : v;
        ctx.statusApplied = true;
      }
    }
    if (value === undefined) continue;
    decls.push(`$v${i}: ${typeString(a.type)}`);
    uses.push(`${a.name}: $v${i}`);
    variables[`v${i}`] = value;
    i++;
  }

  // What comes back: a connection (edges { node }), an object holding a list, or a plain list of posts.
  const returnType = await schema.get(named(field.type)?.name);
  if (!returnType) throw new Error("Could not read the type that Buffer's posts query returns");
  let selection: string;
  let path: "edges" | string | null;
  const edges = returnType.fields?.find((f) => f.name === "edges");
  const holder = returnType.fields?.find((f) => /^(nodes|posts|items|results)$/i.test(f.name));
  if (edges) {
    const edgeType = await schema.get(named(edges.type)?.name);
    const nodeField = edgeType?.fields?.find((f) => f.name === "node");
    const nodeType = await schema.get(named(nodeField?.type ?? null)?.name);
    if (!nodeType) throw new Error("Could not read the post type inside Buffer's posts connection");
    selection = `edges { node { ${await postSelection(schema, nodeType)} } }`;
    path = "edges";
  } else if (holder) {
    const postType = await schema.get(named(holder.type)?.name);
    if (!postType) throw new Error("Could not read the post type in Buffer's posts result");
    selection = `${holder.name} { ${await postSelection(schema, postType)} }`;
    path = holder.name;
  } else {
    selection = await postSelection(schema, returnType);
    path = null;
  }

  const query = `query BufferPosts${decls.length ? `(${decls.join(", ")})` : ""} { posts${uses.length ? `(${uses.join(", ")})` : ""} { ${selection} } }`;
  const data = await client.query<{ posts: unknown }>(query, variables);
  let raw: unknown = data.posts;
  if (path === "edges") raw = ((raw as { edges?: { node: unknown }[] })?.edges ?? []).map((e) => e.node);
  else if (path) raw = (raw as Record<string, unknown>)?.[path] ?? [];
  const nodes = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];

  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const posts = nodes.map((n): BufferPost => ({
    id: String(n.id),
    statusRaw: String(n.status ?? ""),
    text: str(n.text) ?? str(n.content),
    link: str(n.externalLink) ?? str(n.link) ?? str(n.url),
    postedAt: str(n.sentAt) ?? str(n.publishedAt) ?? str(n.dueAt) ?? str(n.scheduledAt) ?? str(n.createdAt),
    channelId: str(n.channelId) ?? str((n.channel as { id?: unknown } | undefined)?.id),
    metrics: normMetrics(n.metrics),
  }));
  return { posts, statusApplied: ctx.statusApplied };
}

// ---------------------------------------------------------------- sync into the database

export interface PostsSyncResult { saved: number; errors: string[] }

export async function syncBufferPosts(db: PrismaClient): Promise<PostsSyncResult> {
  const accounts = await db.integrationSetting.findMany({ where: { provider: { in: BUFFER_ACCOUNTS.map((a) => a.provider) } } });
  const result: PostsSyncResult = { saved: 0, errors: [] };
  for (const account of accounts) {
    if (!account.apiKeyEncrypted) continue;
    const config = BUFFER_ACCOUNTS.find((a) => a.provider === account.provider);
    if (!config) continue;
    try {
      const client = new BufferClient(await decryptSecret(account.apiKeyEncrypted));
      const orgId = await client.getOrganizationId();
      const channels = await client.listChannels(orgId);
      const info = new Map<string, { platform: SocialPlatform; language: SocialLanguage }>();
      for (const c of channels) {
        if (EXCLUDED_CHANNEL_NAMES.has(c.name.toLowerCase())) continue;
        const platform = SERVICE_TO_PLATFORM[c.service];
        if (!platform) continue;
        const language = config.languageMode === "fixed" && config.fixedLanguage ? config.fixedLanguage : (detectLanguageFromChannelName(c.name) ?? "EN");
        info.set(c.id, { platform, language });
      }
      const channelIds = [...info.keys()];
      if (channelIds.length === 0) continue;

      for (const status of ["SENT", "QUEUED"] as PostStatus[]) {
        try {
          const { posts, statusApplied } = await fetchBufferPosts(client, orgId, channelIds, status);
          const seen: string[] = [];
          for (const p of posts) {
            // When the status could not be filtered in the query, sort the posts by their own status here.
            if (!statusApplied) {
              const kind = /sent|publish/i.test(p.statusRaw) ? "SENT" : /sched|queue|pend/i.test(p.statusRaw) ? "QUEUED" : null;
              if (kind !== status) continue;
            }
            const ch = p.channelId ? info.get(p.channelId) : undefined;
            if (!ch || !p.channelId) continue;
            seen.push(p.id);
            const data = { channelId: p.channelId, platform: ch.platform, language: ch.language, status, text: p.text, link: p.link, postedAt: p.postedAt ? new Date(p.postedAt) : null, metrics: p.metrics as never, fetchedAt: new Date() };
            await db.socialPost.upsert({ where: { provider_bufferId: { provider: account.provider, bufferId: p.id } }, update: data, create: { provider: account.provider, bufferId: p.id, ...data } });
            result.saved++;
          }
          // A post that is no longer queued has been sent or removed: drop it from the queued list.
          if (status === "QUEUED") await db.socialPost.deleteMany({ where: { provider: account.provider, status: "QUEUED", bufferId: { notIn: seen } } });
        } catch (e) {
          result.errors.push(`${account.provider} ${status}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    } catch (e) {
      result.errors.push(`${account.provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

/** A readable summary of the parts of Buffer's live schema that posts depend on (for the admin check). */
export async function describeBufferSchema(db: PrismaClient): Promise<string> {
  const account = (await db.integrationSetting.findMany({ where: { provider: { in: BUFFER_ACCOUNTS.map((a) => a.provider) } } })).find((a) => a.apiKeyEncrypted);
  if (!account?.apiKeyEncrypted) return "No Buffer API key is configured yet (Settings › Buffer).";
  const client = new BufferClient(await decryptSecret(account.apiKeyEncrypted));
  const schema = new Schema(client);
  const lines: string[] = [];
  const fmt = (t: TypeRef) => typeString(t);
  const root = await schema.get("Query");
  lines.push(`Query fields: ${(root?.fields ?? []).map((f) => f.name).join(", ")}`);
  const posts = root?.fields?.find((f) => f.name === "posts");
  lines.push(`posts(${(posts?.args ?? []).map((a) => `${a.name}: ${fmt(a.type)}`).join(", ")}) -> ${posts ? fmt(posts.type) : "NOT FOUND"}`);
  const seen = new Set<string>();
  const queue = [...(posts?.args ?? []).map((a) => named(a.type)?.name), named(posts?.type ?? null)?.name, "Post", "Channel", "PostMetrics"];
  while (queue.length && seen.size < 14) {
    const n = queue.shift();
    if (!n || seen.has(n) || ["String", "Int", "Float", "Boolean", "ID", "DateTime"].includes(n)) continue;
    seen.add(n);
    const t = await schema.get(n);
    if (!t) {
      lines.push(`${n}: (no such type)`);
      continue;
    }
    if (t.enumValues) lines.push(`${n} (enum): ${t.enumValues.map((e) => e.name).join(", ")}`);
    const fields = t.fields ?? t.inputFields;
    if (fields) {
      lines.push(`${n} (${t.kind.toLowerCase()}): ${fields.map((f) => `${f.name}: ${fmt(f.type)}`).join(", ")}`);
      for (const f of fields) {
        const nn = named(f.type);
        if (nn?.name && nn.kind !== "SCALAR" && /metrics|edges|node|nodes|filter|input|channel/i.test(f.name)) queue.push(nn.name);
      }
    }
  }
  return lines.join("\n");
}
