import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { markEmailRead } from "@/lib/email-inbox";

// Fired (fire-and-forget) whenever the user opens a message from the
// Email page or the Dashboard's email card — purely an in-CRM marker
// (see the comment on EmailReadState), not a Gmail write.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await withScopedPrismaClient((db) => markEmailRead(db, id));
  return NextResponse.json({ ok: true });
}
