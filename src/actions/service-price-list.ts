"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { translateServicesToFrench } from "@/lib/proposal-ai";

const ServiceItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  clientDescription: z.string().trim().optional(),
  nameFr: z.string().trim().optional(),
  clientDescriptionFr: z.string().trim().optional(),
  projectType: z.string().trim().optional(),
  unitPrice: z.coerce.number().min(0, "Price must be 0 or more"),
  currency: z.enum(["CAD", "USD", "EUR", "GBP"]),
  unit: z.string().trim().optional(),
  active: z.boolean(),
});

function readServiceItemForm(formData: FormData) {
  const raw = {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || undefined,
    clientDescription: String(formData.get("clientDescription") ?? "").trim() || undefined,
    nameFr: String(formData.get("nameFr") ?? "").trim() || undefined,
    clientDescriptionFr: String(formData.get("clientDescriptionFr") ?? "").trim() || undefined,
    projectType: String(formData.get("projectType") ?? "").trim() || undefined,
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

  await withScopedPrismaClient((db) => db.servicePriceListItem.create({ data: { ...data, clientDescription: data.clientDescription ?? null, nameFr: data.nameFr ?? null, clientDescriptionFr: data.clientDescriptionFr ?? null, projectType: data.projectType ?? null } }));
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

  await withScopedPrismaClient((db) => db.servicePriceListItem.update({ where: { id: itemId }, data: { ...data, description: data.description ?? null, clientDescription: data.clientDescription ?? null, nameFr: data.nameFr ?? null, clientDescriptionFr: data.clientDescriptionFr ?? null, projectType: data.projectType ?? null } }));
  revalidatePath("/settings");
  return { success: t.servicePriceList.saved };
}

export async function deleteServicePriceListItem(itemId: string) {
  await requireAdmin();
  await withScopedPrismaClient((db) => db.servicePriceListItem.delete({ where: { id: itemId } }));
  revalidatePath("/settings");
}

// Fills in the French name / client description of every service that has none yet, with the AI, so
// proposals and invoices for French-speaking clients read in French. Existing French text is never touched.
export async function translatePriceListToFrench(): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const fr = session.user.language === "FR";
  const result = await withScopedPrismaClient(async (db) => {
    const items = await db.servicePriceListItem.findMany({
      where: { OR: [{ nameFr: null }, { AND: [{ clientDescription: { not: null } }, { clientDescriptionFr: null }] }] },
      select: { id: true, name: true, clientDescription: true, nameFr: true, clientDescriptionFr: true },
    });
    if (items.length === 0) return { done: 0 };
    const out = await translateServicesToFrench(db, items);
    if ("error" in out) return out;
    for (const row of out.translations) {
      const item = items.find((i) => i.id === row.id);
      if (!item) continue;
      await db.servicePriceListItem.update({
        where: { id: row.id },
        data: {
          ...(item.nameFr ? {} : { nameFr: row.name || null }),
          ...(item.clientDescriptionFr || !item.clientDescription ? {} : { clientDescriptionFr: row.clientDescription || null }),
        },
      });
    }
    return { done: out.translations.length };
  });
  revalidatePath("/settings");
  if ("error" in result) return { error: result.error };
  return { success: fr ? `${result.done} service(s) traduit(s) en français.` : `${result.done} service(s) translated to French.` };
}
