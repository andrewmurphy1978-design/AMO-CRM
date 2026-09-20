"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

export async function getBillingSettings() {
  return prisma.billingSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

export async function updateBillingSettings(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") throw new Error("Not authorized");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  await prisma.billingSettings.upsert({
    where: { id: "singleton" },
    update: {
      chargeCanadianTax: formData.get("chargeCanadianTax") === "on",
      gstNumber: String(formData.get("gstNumber") ?? "").trim() || null,
      qstNumber: String(formData.get("qstNumber") ?? "").trim() || null,
    },
    create: {
      id: "singleton",
      chargeCanadianTax: formData.get("chargeCanadianTax") === "on",
      gstNumber: String(formData.get("gstNumber") ?? "").trim() || null,
      qstNumber: String(formData.get("qstNumber") ?? "").trim() || null,
    },
  });

  revalidatePath("/settings");
  return { success: t.billingSettings.saved };
}
