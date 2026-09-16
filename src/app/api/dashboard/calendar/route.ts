import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUpcomingEvents } from "@/lib/google";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await getUpcomingEvents();
  if (events === null) {
    return NextResponse.json({ error: "not_connected" }, { status: 502 });
  }
  return NextResponse.json({ events });
}
