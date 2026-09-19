import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { markEmailCompleted } from "@/lib/email-inbox";

// Fired when the user clicks the green-check "Complete" action on an
// Email page row — moves that message to the Completed section on the
// next render, regardless of its AI category.
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

  await withScopedPrismaClient((db) => markEmailCompleted(db, id));
  return NextResponse.json({ ok: true });
}
