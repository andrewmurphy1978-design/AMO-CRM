import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";
import { syncAffiliateSheet } from "@/lib/affiliate-sheet";

// Triggered by the same GitHub Actions workflow as the systeme.io sync
// (every 15 minutes) — see .github/workflows/nightly-systeme-io-sync.yml.
// Unlike that one, this has no on/off toggle: the sheet rarely changes and
// re-fetching three small CSV exports is cheap, so it just runs every tick.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await withScopedPrismaClient((db) => syncAffiliateSheet(db));
    return NextResponse.json({ ok: result.errors.length === 0, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
