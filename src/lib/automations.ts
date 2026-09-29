import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { MakeClient } from "@/lib/make";

interface MakeMetadata {
  zone?: string;
  teamId?: string;
}

export async function getMakeClient(): Promise<{ client: MakeClient; teamId: number } | null> {
  return withScopedPrismaClient(async (db) => {
    const setting = await db.integrationSetting.findUnique({ where: { provider: "make" } });
    if (!setting?.apiKeyEncrypted) return null;
    const metadata = (setting.metadata as MakeMetadata | null) ?? {};
    const teamId = Number(metadata.teamId);
    if (!teamId) return null;
    const apiKey = await decryptSecret(setting.apiKeyEncrypted);
    return { client: new MakeClient(apiKey, metadata.zone || "us2.make.com"), teamId };
  });
}

export interface MakeSyncResult {
  executionsSynced: number;
}

// Same reasoning as runSystemeIoSync in src/lib/sync.ts: this can make many
// database calls (one per execution per scenario), and the raw `prisma`
// proxy would open a fresh, never-closed connection for every one of them.
// One scoped client is reused for the whole sync instead.
export async function runMakeSync(): Promise<MakeSyncResult> {
  return withScopedPrismaClient((db) => runMakeSyncWith(db));
}

// Keeps the Dashboard's Automations card current on every load, reusing the
// page's own already-open db client rather than calling runMakeSync()
// (which opens its own scoped client) — nesting a second one would open a
// second Postgres connection within the same Worker invocation, the exact
// pattern withScopedPrismaClient exists to prevent (see its own header
// comment). Never throws: Make being unconfigured, or a transient API
// failure, just leaves the existing AutomationRun rows as they were — same
// "defensive, never breaks the page" rule every other header widget
// (weather/markets/sports) already follows.
export async function refreshMakeRunsQuietly(db: PrismaClient): Promise<void> {
  try {
    await runMakeSyncWith(db);
  } catch {
    // Not configured, or a transient Make API error.
  }
}

async function runMakeSyncWith(db: PrismaClient): Promise<MakeSyncResult> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "make" } });
  if (!setting?.apiKeyEncrypted) {
    throw new Error("Make API key is not configured");
  }
  const metadata = (setting.metadata as MakeMetadata | null) ?? {};
  const teamId = Number(metadata.teamId);
  if (!teamId) {
    throw new Error("Make team ID is not configured");
  }
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);
  const client = new MakeClient(apiKey, metadata.zone || "us2.make.com");

  let executionsSynced = 0;

  try {
    const scenarios = await client.listScenarios(teamId);
    for (const scenario of scenarios) {
      const executions = await client.listExecutions(scenario.id, 20);
      for (const execution of executions) {
        if (!execution.id) continue;

        const occurredAt = execution.endedAt
          ? new Date(execution.endedAt)
          : execution.startedAt
            ? new Date(execution.startedAt)
            : new Date();

        const data = {
          source: "make",
          externalId: execution.id,
          name: execution.scenarioName ?? scenario.name,
          status: execution.status,
          occurredAt,
          raw: execution.raw as never,
        };

        await db.automationRun.upsert({
          where: { source_externalId: { source: "make", externalId: execution.id } },
          update: data,
          create: data,
        });
        executionsSynced += 1;
      }
    }

    await db.integrationSetting.update({
      where: { provider: "make" },
      data: { lastSyncedAt: new Date(), lastSyncStatus: "success", lastSyncError: null },
    });

    return { executionsSynced };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await db.integrationSetting.update({
      where: { provider: "make" },
      data: { lastSyncStatus: "error", lastSyncError: message },
    });
    throw error;
  }
}
