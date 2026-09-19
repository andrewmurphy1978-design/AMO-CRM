import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { markEmailUncompleted } from "@/lib/email-inbox";

// The Completed section's own check button — undoes a complete that was
// clicked by mistake, moving the message back to whichever section it was
// in before.
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

  await withScopedPrismaClient((db) => markEmailUncompleted(db, id));
  return NextResponse.json({ ok: true });
}
