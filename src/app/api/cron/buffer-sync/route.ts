import { NextResponse } from "next/server";
import { runBufferSync } from "@/lib/buffer";
import { withScopedPrismaClient } from "@/lib/prisma";
import { syncBufferPosts } from "@/lib/buffer-posts";

// The same GitHub Actions workflow that pings systeme-io-sync every 15
// minutes also pings this route — it just runs once a day, at 08:00
// America/Montreal, no admin-configurable schedule needed (unlike
// systeme.io's) since this only ever has the one daily cadence.
function isEightAmMontreal(): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return hour === "08" && Number(minute) < 15;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isEightAmMontreal()) {
    return NextResponse.json({ skipped: true, reason: "not the scheduled time" });
  }

  const result = await runBufferSync();
  const posts = await withScopedPrismaClient((db) => syncBufferPosts(db)).catch((e) => ({ saved: 0, errors: [String(e)] }));
  return NextResponse.json({ ok: true, ...result, posts });
}
