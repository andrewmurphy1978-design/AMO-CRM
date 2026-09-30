import { NextResponse } from "next/server";
import { syncAllGoogleTasks } from "@/lib/google-tasks";

// Syncs Google Tasks for everyone who has it turned on. The 15-minute
// email-poll job already calls the same thing; this route exists so it can
// also be triggered on its own.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await syncAllGoogleTasks();
  return NextResponse.json({ ok: true });
}
