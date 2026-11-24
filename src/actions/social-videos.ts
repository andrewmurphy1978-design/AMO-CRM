"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { requestVideoChanges, scheduleApprovedVideo, type VideoResult } from "@/lib/social-videos";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") throw new Error("Only admins can approve videos.");
}

/** Approves one video and schedules it everywhere (one video per call keeps each request small). */
export async function approveSocialVideo(id: string): Promise<{ status: string; results: VideoResult[]; movedTo: string | null } | { error: string }> {
  try {
    await requireAdmin();
    const result = await withScopedPrismaClient((db) => scheduleApprovedVideo(db, id));
    revalidatePath("/social-analytics");
    revalidatePath("/briefing");
    return result;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function requestSocialVideoChanges(id: string, feedback: string): Promise<{ ok: true } | { error: string }> {
  try {
    await requireAdmin();
    await withScopedPrismaClient((db) => requestVideoChanges(db, id, feedback));
    revalidatePath("/social-analytics");
    revalidatePath("/briefing");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
