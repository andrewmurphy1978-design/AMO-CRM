"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const DEFAULT_COLOR = "#64748b";

async function requireUser() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function addEmailAddressColor(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireUser();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const address = String(formData.get("address") ?? "").trim();
  const color = String(formData.get("color") ?? DEFAULT_COLOR).trim() || DEFAULT_COLOR;
  if (!address) return { error: t.settings.emailAddressColorRequired };

  try {
    await withScopedPrismaClient((db) => db.emailAddressColor.create({ data: { address, color } }));
  } catch {
    return { error: t.settings.emailAddressColorDuplicate };
  }

  revalidatePath("/settings");
  revalidatePath("/email");
  return {};
}

export async function updateEmailAddressColor(id: string, color: string): Promise<{ error?: string }> {
  await requireUser();
  if (!id || !color) return { error: "Invalid input" };

  await withScopedPrismaClient((db) => db.emailAddressColor.update({ where: { id }, data: { color } }));

  revalidatePath("/settings");
  revalidatePath("/email");
  return {};
}

export async function deleteEmailAddressColor(id: string): Promise<void> {
  await requireUser();
  await withScopedPrismaClient((db) => db.emailAddressColor.delete({ where: { id } }));
  revalidatePath("/settings");
  revalidatePath("/email");
}
