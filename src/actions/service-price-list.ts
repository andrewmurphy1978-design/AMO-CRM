"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const ServiceItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  unitPrice: z.coerce.number().min(0, "Price must be 0 or more"),
  currency: z.enum(["CAD", "USD", "EUR", "GBP"]),
  unit: z.string().trim().optional(),
  active: z.boolean(),
});

function readServiceItemForm(formData: FormData) {
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    unitPrice: String(formData.get("unitPrice") ?? "0"),
    currency: String(formData.get("currency") ?? "CAD"),
    unit: String(formData.get("unit") ?? "").trim() || undefined,
    active: formData.get("active") === "on",
  };
  return ServiceItemSchema.parse(raw);
}

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") throw new Error("Not authorized");
  return session;
}

export async function createServicePriceListItem(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readServiceItemForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  await prisma.servicePriceListItem.create({ data });
  revalidatePath("/settings");
  return { success: t.servicePriceList.saved };
}

export async function updateServicePriceListItem(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const itemId = String(formData.get("itemId") ?? "");
  if (!itemId) return { error: t.actions.invalidInput };

  let data;
  try {
    data = readServiceItemForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  await prisma.servicePriceListItem.update({ where: { id: itemId }, data });
  revalidatePath("/settings");
  return { success: t.servicePriceList.saved };
}

export async function deleteServicePriceListItem(itemId: string) {
  await requireAdmin();
  await prisma.servicePriceListItem.delete({ where: { id: itemId } });
  revalidatePath("/settings");
}
