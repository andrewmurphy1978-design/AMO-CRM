import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getUserSportsPicks } from "@/lib/dashboard-sports-picks";
import { getNhlSnapshot, getMlbSnapshot } from "@/lib/sports";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const picks = await withScopedPrismaClient((db) => getUserSportsPicks(session, db));
  if (picks.league === "MLB") {
    const mlb = await getMlbSnapshot(Number(picks.teamMlb));
    return NextResponse.json({ league: "MLB", mlb });
  }
  const nhl = await getNhlSnapshot(picks.teamNhl);
  return NextResponse.json({ league: "NHL", nhl });
}
