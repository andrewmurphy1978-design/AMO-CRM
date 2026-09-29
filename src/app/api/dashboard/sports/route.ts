import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getUserSportsPicks } from "@/lib/dashboard-sports-picks";
import { getNhlSnapshot, getMlbSnapshot, getNflSnapshot, getCflSnapshot, getMlsSnapshot, getNbaSnapshot } from "@/lib/sports";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const picks = await withScopedPrismaClient((db) => getUserSportsPicks(session, db));
  switch (picks.league) {
    case "MLB": {
      const mlb = await getMlbSnapshot(Number(picks.teamMlb));
      return NextResponse.json({ league: "MLB", mlb });
    }
    case "NFL": {
      const nfl = await getNflSnapshot(picks.teamNfl);
      return NextResponse.json({ league: "NFL", nfl });
    }
    case "CFL": {
      const cfl = await getCflSnapshot(picks.teamCfl);
      return NextResponse.json({ league: "CFL", cfl });
    }
    case "MLS": {
      const mls = await getMlsSnapshot(picks.teamMls);
      return NextResponse.json({ league: "MLS", mls });
    }
    case "NBA": {
      const nba = await getNbaSnapshot(picks.teamNba);
      return NextResponse.json({ league: "NBA", nba });
    }
    default: {
      const nhl = await getNhlSnapshot(picks.teamNhl);
      return NextResponse.json({ league: "NHL", nhl });
    }
  }
}
