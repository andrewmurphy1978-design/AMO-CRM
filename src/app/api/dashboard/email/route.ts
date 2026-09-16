import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getValidAccessToken, getRecentEmails } from "@/lib/google";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 502 });
  }

  const emails = await getRecentEmails(accessToken);
  if (emails === null) {
    return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
  }
  return NextResponse.json({ emails });
}
