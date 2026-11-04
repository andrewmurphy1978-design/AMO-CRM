import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const publicKey = await withScopedPrismaClient((db) => getVapidPublicKey(db));
  return NextResponse.json({ publicKey });
}
