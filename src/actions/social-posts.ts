"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { requireAccess } from "@/lib/permissions";
import { syncBufferPosts, describeBufferSchema } from "@/lib/buffer-posts";
import { runMakeSync } from "@/lib/automations";

/** Reads the latest sent and queued posts from Buffer into the CRM. */
export async function refreshSocialPostsAction(): Promise<{ saved: number; errors: string[]; channels: { name: string; platform: string; language: string; sent: number; queued: number; error?: string }[] }> {
  await requireAccess("socialAnalytics", "READ");
  const result = await withScopedPrismaClient((db) => syncBufferPosts(db));
  // Also bring in the latest Make runs, which the weekly check reads (not configured / unreachable is fine).
  await runMakeSync().catch(() => undefined);
  revalidatePath("/social-analytics");
  return result;
}

/** Admin only: the parts of Buffer's live schema that posts depend on, to see what Buffer really offers. */
export async function inspectBufferSchemaAction(): Promise<{ text: string } | { error: string }> {
  await requireAccess("socialAnalytics", "READ");
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return { error: "Only admins can run this check." };
  try {
    return { text: await withScopedPrismaClient((db) => describeBufferSchema(db)) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
