"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { encryptSecret } from "@/lib/crypto";
import { AFFILIATE_STATUS_VALUES } from "@/lib/affiliate-status";
import {
  getShortIoConfig,
  createShortIoLink,
  updateShortIoLink,
  listShortIoDomains,
  listShortIoLinks,
  getShortIoLinkStatistics,
} from "@/lib/shortio";

const AffiliateProgramSchema = z.object({
  tab: z.enum(["AI_TOOLS", "TRAINING_PROGRAMS", "BUSINESS_OPPORTUNITIES"]),
  name: z.string().trim().min(1, "A program name is required"),
  type: z.string().trim().optional(),
  category: z.string().trim().optional(),
  shortioCreated: z.boolean(),
  brandedLink: z.string().trim().optional(),
  destinationLink: z.string().trim().optional(),
  affiliateStatus: z.enum(AFFILIATE_STATUS_VALUES).optional(),
  statusDetails: z.string().trim().optional(),
  frenchSlug: z.string().trim().optional(),
  frenchLink: z.string().trim().optional(),
  followUpNeeded: z.boolean(),
  notes: z.string().trim().optional(),
  accountPlan: z.string().trim().optional(),
  applyUrl: z.string().trim().optional(),
  applyPlatform: z.string().trim().optional(),
  hasApi: z.boolean(),
});

function readAffiliateProgramForm(formData: FormData) {
  const raw = {
    tab: String(formData.get("tab") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "").trim() || undefined,
    category: String(formData.get("category") ?? "").trim() || undefined,
    shortioCreated: formData.get("shortioCreated") === "on",
    brandedLink: String(formData.get("brandedLink") ?? "").trim() || undefined,
    destinationLink: String(formData.get("destinationLink") ?? "").trim() || undefined,
    affiliateStatus: String(formData.get("affiliateStatus") ?? "").trim() || undefined,
    statusDetails: String(formData.get("statusDetails") ?? "").trim() || undefined,
    frenchSlug: String(formData.get("frenchSlug") ?? "").trim() || undefined,
    frenchLink: String(formData.get("frenchLink") ?? "").trim() || undefined,
    followUpNeeded: formData.get("followUpNeeded") === "on",
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    accountPlan: String(formData.get("accountPlan") ?? "").trim() || undefined,
    applyUrl: String(formData.get("applyUrl") ?? "").trim() || undefined,
    applyPlatform: String(formData.get("applyPlatform") ?? "").trim() || undefined,
    hasApi: formData.get("hasApi") === "on",
  };
  const followUpDateRaw = String(formData.get("followUpDate") ?? "").trim();
  const apiKeyPlaintext = String(formData.get("apiKey") ?? "").trim();
  return {
    ...AffiliateProgramSchema.parse(raw),
    followUpDate: followUpDateRaw ? new Date(followUpDateRaw) : null,
    apiKeyPlaintext,
  };
}

// Best-effort: the CRM record is the source of truth, so a Short.io push
// failure here never blocks the save — it's surfaced to the detail page
// via a query param instead. Only called when the underlying destination
// URL actually changed, since that's the one field Short.io needs to know
// about (path/domain aren't editable through this form).
async function pushDestinationToShortIo(
  apiKey: string,
  linkId: string | null,
  newDestination: string | null | undefined
): Promise<string | null> {
  if (!linkId || !newDestination) return null;
  try {
    await updateShortIoLink(apiKey, linkId, { originalURL: newDestination });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Short.io update failed";
  }
}

export async function createAffiliateProgram(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let parsed;
  try {
    parsed = readAffiliateProgramForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }
  const { apiKeyPlaintext, ...data } = parsed;
  const apiKeyEncrypted = apiKeyPlaintext ? await encryptSecret(apiKeyPlaintext) : undefined;

  const program = await withScopedPrismaClient((db) => db.affiliateProgram.create({ data: { ...data, apiKeyEncrypted } }));

  revalidatePath("/marketing");
  redirect(`/marketing/programs/${program.id}`);
}

export async function updateAffiliateProgram(
  programId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let parsed;
  try {
    parsed = readAffiliateProgramForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }
  const { apiKeyPlaintext, ...data } = parsed;

  const { existing, config } = await withScopedPrismaClient(async (db) => {
    const existing = await db.affiliateProgram.findUnique({ where: { id: programId } });
    const config = await getShortIoConfig(db);
    return { existing, config };
  });
  if (!existing) return { error: "Program not found" };

  let shortioError: string | null = null;
  if (config) {
    if (data.destinationLink !== existing.destinationLink) {
      shortioError ||= await pushDestinationToShortIo(config.apiKey, existing.shortioLinkId, data.destinationLink);
    }
    if (data.frenchLink !== existing.frenchLink) {
      shortioError ||= await pushDestinationToShortIo(config.apiKey, existing.shortioLinkIdFr, data.frenchLink);
    }
  }

  const apiKeyEncrypted = apiKeyPlaintext ? await encryptSecret(apiKeyPlaintext) : undefined;

  await withScopedPrismaClient((db) =>
    db.affiliateProgram.update({
      where: { id: programId },
      data: { ...data, ...(apiKeyEncrypted ? { apiKeyEncrypted } : {}) },
    })
  );

  revalidatePath("/marketing");
  revalidatePath(`/marketing/programs/${programId}`);
  redirect(`/marketing/programs/${programId}${shortioError ? `?shortioError=${encodeURIComponent(shortioError)}` : ""}`);
}

export async function deleteAffiliateProgram(programId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) => db.affiliateProgram.delete({ where: { id: programId } }));
  revalidatePath("/marketing");
  redirect("/marketing");
}

// Admin-gated like the other integration-triggering actions (triggerSystemeIoSync,
// triggerMakeSync) since it spends calls against a shared, paid Short.io account.
export async function createAffiliateShortLink(programId: string, variant: "default" | "fr"): Promise<{ error?: string; shortURL?: string }> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Only admins can create Short.io links" };
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const { program, config } = await withScopedPrismaClient(async (db) => {
    const program = await db.affiliateProgram.findUnique({ where: { id: programId } });
    const config = await getShortIoConfig(db);
    return { program, config };
  });
  if (!program) return { error: "Program not found" };
  if (!config) return { error: t.marketing.shortioNotConfigured };

  const originalURL = variant === "fr" ? program.frenchLink : program.destinationLink;
  if (!originalURL) return { error: t.marketing.shortioMissingSource };

  const domain = variant === "fr" && config.domainFr ? config.domainFr : config.domain;

  let link: { id: string; shortURL: string };
  try {
    link = await createShortIoLink({ apiKey: config.apiKey, domain }, originalURL);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Short.io request failed" };
  }

  await withScopedPrismaClient((db) =>
    db.affiliateProgram.update({
      where: { id: programId },
      data:
        variant === "fr"
          ? { frenchSlug: link.shortURL, shortioLinkIdFr: link.id }
          : { brandedLink: link.shortURL, shortioCreated: true, shortioLinkId: link.id },
    })
  );

  revalidatePath("/marketing");
  revalidatePath(`/marketing/programs/${programId}`);
  return { shortURL: link.shortURL };
}

// Admin-gated, same reason as createAffiliateShortLink. Walks every domain
// on the Short.io account, matches each link to a program by comparing the
// link's own short URL against brandedLink/frenchSlug (the primary key,
// since that's the exact URL Short.io issued) and falls back to matching
// its destination against destinationLink/frenchLink for links the CRM
// doesn't have a brandedLink/frenchSlug for yet. For every match it stores
// the Short.io link id (for future updates) and pulls that link's click
// stats in the same pass.
export async function syncShortIoLinks(): Promise<{
  error?: string;
  linked?: number;
  statsUpdated?: number;
  totalLinks?: number;
  statsError?: string;
}> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Only admins can sync Short.io" };
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  // Everything below — the initial read, every per-program update, all of
  // it — shares this ONE Postgres connection. The first version of this
  // function opened a fresh withScopedPrismaClient (i.e. a fresh Hyperdrive
  // connection) per matched program; with up to 92 programs to walk and a
  // Short.io stats fetch in between each one, that's exactly the pattern
  // documented in src/lib/prisma.ts as the root cause of Error 1102 —
  // opening far more connections/subrequests in one Worker invocation than
  // it can sustain. A single connection held for the whole sync avoids that
  // entirely; the external Short.io fetches in the loop are unavoidable
  // (there's no bulk-stats endpoint) but don't touch Postgres at all.
  return withScopedPrismaClient(async (db) => {
    const programs = await db.affiliateProgram.findMany({
      select: { id: true, brandedLink: true, frenchSlug: true, destinationLink: true, frenchLink: true },
    });
    const config = await getShortIoConfig(db);
    if (!config) return { error: t.marketing.shortioNotConfigured };

    let allLinks: Awaited<ReturnType<typeof listShortIoLinks>> = [];
    try {
      const domains = await listShortIoDomains(config.apiKey);
      for (const domain of domains) {
        if (domain.hostname !== config.domain && domain.hostname !== config.domainFr) continue;
        const links = await listShortIoLinks(config.apiKey, domain.id);
        allLinks = allLinks.concat(links);
      }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Short.io request failed" };
    }

    const byShortUrl = new Map(allLinks.map((l) => [l.shortURL.replace(/\/$/, ""), l]));
    const byOriginalUrl = new Map(allLinks.map((l) => [l.originalURL.replace(/\/$/, ""), l]));
    const norm = (url: string | null) => (url ? url.replace(/\/$/, "") : null);

    let linked = 0;
    let statsUpdated = 0;
    let statsError: string | null = null;

    for (const program of programs) {
      const enLink =
        (program.brandedLink && byShortUrl.get(norm(program.brandedLink)!)) ||
        (program.destinationLink && byOriginalUrl.get(norm(program.destinationLink)!));
      const frLink =
        (program.frenchSlug && byShortUrl.get(norm(program.frenchSlug)!)) ||
        (program.frenchLink && byOriginalUrl.get(norm(program.frenchLink)!));
      if (!enLink && !frLink) continue;

      const data: Record<string, unknown> = {};
      if (enLink) {
        data.shortioLinkId = enLink.idString;
        if (!program.brandedLink) data.brandedLink = enLink.shortURL;
        data.shortioCreated = true;
      }
      if (frLink) {
        data.shortioLinkIdFr = frLink.idString;
        if (!program.frenchSlug) data.frenchSlug = frLink.shortURL;
      }

      let sawStats = false;
      try {
        if (enLink) {
          const stats = await getShortIoLinkStatistics(config.apiKey, [enLink.idString, enLink.id]);
          data.shortioClicks = stats.totalClicks;
          data.shortioStats = stats.raw as object;
          data.shortioLinkId = stats.matchedId; // self-heal to whichever id form Short.io's stats endpoint actually accepted
          statsUpdated++;
          sawStats = true;
        }
        if (frLink) {
          const stats = await getShortIoLinkStatistics(config.apiKey, [frLink.idString, frLink.id]);
          data.shortioClicksFr = stats.totalClicks;
          data.shortioStatsFr = stats.raw as object;
          data.shortioLinkIdFr = stats.matchedId;
          statsUpdated++;
          sawStats = true;
        }
      } catch (error) {
        // Stats are a bonus on top of the link match — a failed stats call
        // shouldn't stop the link itself from being recorded. But it also
        // shouldn't be invisible: the first failure is kept so the admin
        // sees exactly why (this used to be swallowed entirely, which is
        // why stats silently never populated).
        if (!statsError) statsError = error instanceof Error ? error.message : "Short.io stats request failed";
      }
      if (sawStats) data.shortioStatsSyncedAt = new Date();

      await db.affiliateProgram.update({ where: { id: program.id }, data });
      linked++;
    }

    revalidatePath("/marketing");
    return { linked, statsUpdated, totalLinks: allLinks.length, statsError: statsError ?? undefined };
  });
}

// Per-program equivalent of the stats half of syncShortIoLinks, for a
// "Refresh stats" button on that one program's detail page rather than
// re-running the full account sync.
export async function refreshAffiliateProgramStats(programId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Only admins can refresh Short.io stats" };
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const { program, config } = await withScopedPrismaClient(async (db) => {
    const program = await db.affiliateProgram.findUnique({ where: { id: programId } });
    const config = await getShortIoConfig(db);
    return { program, config };
  });
  if (!program) return { error: "Program not found" };
  if (!config) return { error: t.marketing.shortioNotConfigured };
  if (!program.shortioLinkId && !program.shortioLinkIdFr) return { error: t.marketing.shortioMissingSource };

  const data: Record<string, unknown> = { shortioStatsSyncedAt: new Date() };
  try {
    if (program.shortioLinkId) {
      const stats = await getShortIoLinkStatistics(config.apiKey, [program.shortioLinkId]);
      data.shortioClicks = stats.totalClicks;
      data.shortioStats = stats.raw as object;
      data.shortioLinkId = stats.matchedId;
    }
    if (program.shortioLinkIdFr) {
      const stats = await getShortIoLinkStatistics(config.apiKey, [program.shortioLinkIdFr]);
      data.shortioClicksFr = stats.totalClicks;
      data.shortioStatsFr = stats.raw as object;
      data.shortioLinkIdFr = stats.matchedId;
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Short.io request failed" };
  }

  await withScopedPrismaClient((db) => db.affiliateProgram.update({ where: { id: programId }, data }));
  revalidatePath(`/marketing/programs/${programId}`);
  return {};
}
