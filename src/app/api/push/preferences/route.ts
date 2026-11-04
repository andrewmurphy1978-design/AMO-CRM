import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { PUSH_CATEGORIES } from "@/lib/push";

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
  const { pref, devices, thisDevice } = await withScopedPrismaClient(async (db) => ({
    pref: await db.pushPreference.findUnique({ where: { userId: session.user.id } }),
    devices: await db.pushSubscription.count({ where: { userId: session.user.id } }),
    thisDevice: endpoint ? (await db.pushSubscription.count({ where: { userId: session.user.id, endpoint } })) > 0 : false,
  }));
  return NextResponse.json({ disabled: pref?.disabled ?? [], devices, thisDevice, admin: session.user.role === "ADMIN" });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { disabled?: string[] } | null;
  const disabled = (body?.disabled ?? []).filter((c) => (PUSH_CATEGORIES as readonly string[]).includes(c));
  await withScopedPrismaClient((db) =>
    db.pushPreference.upsert({ where: { userId: session.user.id }, update: { disabled }, create: { userId: session.user.id, disabled } })
  );
  return NextResponse.json({ ok: true });
}
