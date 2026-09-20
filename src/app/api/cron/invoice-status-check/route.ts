import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";

// The same GitHub Actions workflow that pings the other cron routes every
// 15 minutes also pings this one — it only needs to run once a day since
// it's just flipping SENT invoices whose due date has passed to OVERDUE
// (the reminders list then picks those up on its own, no separate
// "send" step to schedule here — see src/lib/invoice-reminders.ts for why
// reminders are drafted rather than auto-sent).
function isNineAmMontreal(): boolean {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montreal",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return hour === "09" && Number(minute) < 15;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isNineAmMontreal()) {
    return NextResponse.json({ skipped: true, reason: "not the scheduled time" });
  }

  const result = await withScopedPrismaClient((db) =>
    db.invoice.updateMany({
      where: { status: "SENT", dueDate: { lt: new Date() } },
      data: { status: "OVERDUE" },
    })
  );

  return NextResponse.json({ ok: true, flippedToOverdue: result.count });
}
