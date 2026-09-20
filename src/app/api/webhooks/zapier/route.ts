import { NextResponse } from "next/server";
import { withScopedPrismaClient } from "@/lib/prisma";

// Zapier has no usable "list my recent Zap runs" API for a personal account,
// so this is the practical alternative: add one extra step at the end of
// each Zap (a "Webhooks by Zapier" POST action) pointed at this URL with
// header `Authorization: Bearer $ZAPIER_WEBHOOK_SECRET`, sending a small
// JSON body describing what just happened.
//
// Expected body (all fields optional except one of zapName/name):
// { "zapName": "...", "status": "success" | "error", "message": "...", "runId": "..." }
export async function POST(request: Request) {
  const secret = process.env.ZAPIER_WEBHOOK_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = (body ?? {}) as Record<string, unknown>;
  const name = pickString(data, ["zapName", "name"]);
  const statusRaw = (pickString(data, ["status"]) ?? "success").toLowerCase();
  const status = statusRaw.includes("fail") || statusRaw.includes("error") ? "error" : "success";
  const message = pickString(data, ["message", "error"]);
  const externalId = pickString(data, ["runId", "id"]);

  const runData = { name, status, message, occurredAt: new Date(), raw: data as never };
  await withScopedPrismaClient((db) => {
    if (externalId) {
      // A real run id lets a Zap's own retries land as one row instead of piling up duplicates.
      return db.automationRun.upsert({
        where: { source_externalId: { source: "zapier", externalId } },
        update: runData,
        create: { source: "zapier", externalId, ...runData },
      });
    }
    return db.automationRun.create({ data: { source: "zapier", ...runData } });
  });

  return NextResponse.json({ ok: true });
}

function pickString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    if (typeof data[key] === "string" && data[key]) return data[key] as string;
  }
  return null;
}
