import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { sendTestPush } from "@/lib/push";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { lang?: string } | null;
  const fr = body?.lang === "fr";
  const sent = await withScopedPrismaClient((db) =>
    sendTestPush(db, session.user.id, {
      title: "AMO CRM",
      body: fr ? "Les notifications fonctionnent sur cet appareil." : "Notifications are working on this device.",
      url: "/settings",
      tag: "test",
    })
  );
  return NextResponse.json({ ok: sent > 0, devices: sent });
}
