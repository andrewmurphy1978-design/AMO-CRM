import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSystemeIoSync } from "@/lib/sync";

// Floors an "HH:MM" time to its 15-minute bucket, e.g. "03:07" -> "03:00".
function floorTo15(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${String(h).padStart(2, "0")}:${String(Math.floor(m / 15) * 15).padStart(2, "0")}`;
}

// The GitHub Actions workflow triggers this every 15 minutes; only the one
// invocation whose bucket matches the admin's chosen time actually syncs.
function isScheduledTimeNow(scheduledTime: string): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return floorTo15(`${hour}:${minute}`) === floorTo15(scheduledTime);
}

// Configure a scheduled trigger (e.g. Vercel Cron) to call this route
// periodically with `Authorization: Bearer $CRON_SECRET`. Only runs the sync
// when auto-sync is turned on in Settings and the current time matches the
// admin's chosen schedule (America/Montreal), within a 15-minute bucket.
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

  if (!isScheduledTimeNow(setting.autoSyncTime)) {
    return NextResponse.json({ skipped: true, reason: "not the scheduled time" });
  }

  try {
    const result = await runSystemeIoSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
