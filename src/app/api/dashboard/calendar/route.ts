import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken, getUpcomingEvents } from "@/lib/google";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 502 });
  }

  const events = await getUpcomingEvents(accessToken);
  if (events === null) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
  return NextResponse.json({ events });
}
