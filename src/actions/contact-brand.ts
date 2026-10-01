"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { BRAND_CATEGORIES, MAX_BRAND_FILE_BYTES, type BrandItemInput } from "@/lib/brand";

export async function saveContactBrand(
  contactId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let items: BrandItemInput[];
  try {
    const parsed = JSON.parse(String(formData.get("brand") ?? "[]")) as BrandItemInput[];
    const keys = new Set(BRAND_CATEGORIES.map((c) => c.key));
    items = parsed
      .filter((i) => keys.has(i.category) && (String(i.label ?? "").trim() || String(i.value ?? "").trim()))
      .map((i) => ({
        category: i.category,
        label: String(i.label ?? "").trim() || String(i.value ?? "").trim().slice(0, 60),
        value: String(i.value ?? "").trim(),
        note: String(i.note ?? "").trim(),
      }));
  } catch {
    return { error: t.actions.invalidInput };
  }

  if (items.some((i) => i.value.length > Math.ceil(MAX_BRAND_FILE_BYTES * 1.4))) {
    return { error: session.user.language === "FR" ? "Un fichier est trop volumineux (600 Ko maximum)." : "A file is too large (600 KB maximum)." };
  }

  await withScopedPrismaClient(async (db) => {
    const order = new Map<string, number>();
    await db.$transaction([
      db.contactBrandItem.deleteMany({ where: { contactId } }),
      ...(items.length > 0
        ? [
            db.contactBrandItem.createMany({
              data: items.map((i) => {
                const n = order.get(i.category) ?? 0;
                order.set(i.category, n + 1);
                return { contactId, category: i.category, label: i.label, value: i.value || null, note: i.note || null, order: n };
              }),
            }),
          ]
        : []),
    ]);
  });

  revalidatePath(`/contacts/${contactId}`);
  revalidatePath("/projects", "layout");
  return { success: t.actions.contactUpdated };
}
