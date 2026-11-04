import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

// Registers (POST) or removes (DELETE) the calling device for push notifications.
export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const authKey = body?.keys?.auth;
  if (!endpoint || !/^https:\/\//.test(endpoint) || !p256dh || !authKey) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
  await withScopedPrismaClient((db) =>
    db.pushSubscription.upsert({
      where: { endpoint },
      update: { userId: session.user.id, p256dh, auth: authKey, userAgent },
      create: { userId: session.user.id, endpoint, p256dh, auth: authKey, userAgent },
    })
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  await withScopedPrismaClient((db) => db.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: session.user.id } }));
  return NextResponse.json({ ok: true });
}
