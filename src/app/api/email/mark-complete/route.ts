import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { markEmailCompleted } from "@/lib/email-inbox";
import { archiveLinkedThread } from "@/lib/email-archive";

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
  // Keep a saved copy of what was marked Done (archived under "linked" semantics: the thread key is the message id here).
  await withScopedPrismaClient((db) => archiveLinkedThread(db, session.user.id, id, "done"));
  return NextResponse.json({ ok: true });
}
