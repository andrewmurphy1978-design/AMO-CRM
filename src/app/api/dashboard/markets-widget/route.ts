import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getMarketsSnapshot, pickMarketsWidgetData } from "@/lib/markets";
import { getUserMarketsPicks } from "@/lib/dashboard-markets-picks";

// Backs the header Markets widget's own refresh button — same full
// snapshot fetch as /api/dashboard/markets, just narrowed to the signed-in
// user's own currency + item picks before returning.
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { currency, items } = await withScopedPrismaClient((db) => getUserMarketsPicks(session, db));
  const snapshot = await getMarketsSnapshot();
  return NextResponse.json(pickMarketsWidgetData(snapshot, currency, items));
}
