import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getMarketsSnapshot } from "@/lib/markets";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getMarketsSnapshot();
  return NextResponse.json(snapshot);
}
