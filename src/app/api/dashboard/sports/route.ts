import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSportsSnapshot } from "@/lib/sports";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getSportsSnapshot();
  return NextResponse.json(snapshot);
}
