import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRecentEmails } from "@/lib/google";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emails = await getRecentEmails();
  if (emails === null) {
    return NextResponse.json({ error: "not_connected" }, { status: 502 });
  }
  return NextResponse.json({ emails });
}
