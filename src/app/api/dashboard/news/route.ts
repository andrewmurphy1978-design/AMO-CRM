import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsDigest } from "@/lib/news";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const digest = await getNewsDigest();
  return NextResponse.json(digest);
}
