import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getNewsDigest } from "@/lib/news";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const lang = request.nextUrl.searchParams.get("lang") === "fr" ? "fr" : "en";
  const digest = await getNewsDigest(lang);
  return NextResponse.json(digest);
}
