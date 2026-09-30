"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { disableGoogleTasks, enableGoogleTasks, syncUserTasks } from "@/lib/google-tasks";

// The Settings > Google integration "Google Tasks" buttons. One action with
// an `intent` field so a single useActionState shows every outcome.
export async function googleTasksAction(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const userId = session.user.id;
  const intent = String(formData.get("intent") ?? "");

  const result = await withScopedPrismaClient(async (db): Promise<{ error?: string; success?: string }> => {
    if (intent === "disable") {
      await disableGoogleTasks(db, userId);
      return { success: "Google Tasks sync turned off. Tasks already in Google were left there." };
    }
    if (intent === "enable") {
      const enabled = await enableGoogleTasks(db, userId);
      if ("error" in enabled) return { error: enabled.error };
    }
    const synced = await syncUserTasks(db, userId);
    if ("error" in synced) return { error: synced.error };
    return {
      success: `Synced with Google Tasks: ${synced.pushed} sent to Google, ${synced.pulled} updated from Google${synced.removed ? `, ${synced.removed} removed` : ""}.`,
    };
  });

  revalidatePath("/settings");
  return result;
}
