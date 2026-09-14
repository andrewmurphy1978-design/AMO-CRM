import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSystemeIoSync } from "@/lib/sync";

// Configure a scheduled trigger (e.g. Vercel Cron) to call this route
// periodically with `Authorization: Bearer $CRON_SECRET`. Only runs the sync
// when auto-sync is turned on in Settings.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const setting = await prisma.integrationSetting.findUnique({
    where: { provider: "systeme_io" },
  });

  if (!setting?.autoSyncEnabled || !setting.apiKeyEncrypted) {
    return NextResponse.json({ skipped: true, reason: "auto-sync disabled" });
  }

  try {
    const result = await runSystemeIoSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
