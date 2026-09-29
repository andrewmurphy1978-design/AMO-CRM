import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getUserSportsPicks } from "@/lib/dashboard-sports-picks";
import { getNhlSnapshot, getMlbSnapshot, getNflSnapshot, getCflSnapshot, getMlsSnapshot, getNbaSnapshot } from "@/lib/sports";
import type { SportsCardSnapshot } from "@/app/(app)/sports-card";

// The expanded Sports drop-down now shows every league at once (see
// sports-card.tsx), so its refresh button re-fetches all six here rather
// than just the one league picked for the compact header pill.
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const picks = await withScopedPrismaClient((db) => getUserSportsPicks(session, db));
  const [nhl, mlb, nfl, cfl, mls, nba] = await Promise.all([
    getNhlSnapshot(picks.teamNhl),
    getMlbSnapshot(Number(picks.teamMlb)),
    getNflSnapshot(picks.teamNfl),
    getCflSnapshot(picks.teamCfl),
    getMlsSnapshot(picks.teamMls),
    getNbaSnapshot(picks.teamNba),
  ]);
  const snapshots: SportsCardSnapshot[] = [
    { league: "NHL", nhl },
    { league: "MLB", mlb },
    { league: "NFL", nfl },
    { league: "CFL", cfl },
    { league: "MLS", mls },
    { league: "NBA", nba },
  ];
  return NextResponse.json({ snapshots });
}
