"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import type { TagCategory } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage tags");
  }
  return session;
}

function parseCategory(value: FormDataEntryValue | null): TagCategory {
  return value === "LANGUAGE" || value === "PERSONAL" ? value : "SYSTEME_IO";
}

export async function createTag(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const name = String(formData.get("name") ?? "").trim();
  const category = parseCategory(formData.get("category"));
  const color = String(formData.get("color") ?? "").trim();
  if (!name) {
    return { error: t.tagManagerSettings.nameRequired };
  }

  const existing = await withScopedPrismaClient((db) => db.tag.findUnique({ where: { name } }));
  if (existing) {
    return { error: t.tagManagerSettings.nameExists };
  }

  // New tags go after every existing tag in their category, same "append
  // to the end" default the World Clock zone reorder list uses.
  await withScopedPrismaClient(async (db) => {
    const maxOrder = await db.tag.aggregate({ where: { category }, _max: { order: true } });
    return db.tag.create({
      data: { name, category, color: color || null, order: (maxOrder._max.order ?? 0) + 10 },
    });
  });

  revalidatePath("/settings");
  return { success: t.tagManagerSettings.saved };
}

export async function updateTag(
  id: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const name = String(formData.get("name") ?? "").trim();
  const category = parseCategory(formData.get("category"));
  const color = String(formData.get("color") ?? "").trim();
  if (!name) {
    return { error: t.tagManagerSettings.nameRequired };
  }

  const conflict = await withScopedPrismaClient((db) => db.tag.findFirst({ where: { name, NOT: { id } } }));
  if (conflict) {
    return { error: t.tagManagerSettings.nameExists };
  }

  await withScopedPrismaClient((db) => db.tag.update({ where: { id }, data: { name, category, color: color || null } }));

  revalidatePath("/settings");
  revalidatePath("/contacts");
  return { success: t.tagManagerSettings.saved };
}

export async function deleteTag(id: string): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient((db) => db.tag.delete({ where: { id } }));
  revalidatePath("/settings");
  revalidatePath("/contacts");
}

// Swaps this tag's `order` with its neighbor's within the same category —
// same up/down-arrow mechanic as the World Clock zone reorder list. No-op
// past either end of the list.
export async function moveTag(id: string, direction: "up" | "down"): Promise<void> {
  await requireAdmin();
  await withScopedPrismaClient(async (db: PrismaClient) => {
    const tag = await db.tag.findUnique({ where: { id } });
    if (!tag) return;
    const siblings = await db.tag.findMany({ where: { category: tag.category }, orderBy: [{ order: "asc" }, { name: "asc" }] });
    const index = siblings.findIndex((s) => s.id === id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) return;
    const neighbor = siblings[swapIndex];
    await db.$transaction([
      db.tag.update({ where: { id: tag.id }, data: { order: neighbor.order } }),
      db.tag.update({ where: { id: neighbor.id }, data: { order: tag.order } }),
    ]);
  });
  revalidatePath("/settings");
  revalidatePath("/contacts");
}
