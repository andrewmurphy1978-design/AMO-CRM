"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";

export interface SubscriptionInput {
  name: string;
  amount: number;
  period: string;
  note: string;
}

// Replaces the project's Apps & subscriptions with the rows in the card.
export async function saveProjectSubscriptions(projectId: string, rows: SubscriptionInput[]): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const clean = rows
    .map((r) => ({
      name: r.name.trim(),
      amount: Number.isFinite(r.amount) && r.amount >= 0 ? r.amount : 0,
      period: ["month", "year", "once"].includes(r.period) ? r.period : "month",
      note: r.note.trim(),
    }))
    .filter((r) => r.name);
  await withScopedPrismaClient(async (db) => {
    await db.projectSubscription.deleteMany({ where: { projectId } });
    if (clean.length > 0) await db.projectSubscription.createMany({ data: clean.map((r, order) => ({ ...r, projectId, order })) });
  });
  revalidatePath(`/projects/${projectId}`);
  return {};
}
