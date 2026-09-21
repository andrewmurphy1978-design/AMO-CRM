"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";

const AffiliateProgramSchema = z.object({
  tab: z.enum(["AI_TOOLS", "TRAINING_PROGRAMS", "BUSINESS_OPPORTUNITIES"]),
  name: z.string().trim().min(1, "A program name is required"),
  type: z.string().trim().optional(),
  category: z.string().trim().optional(),
  shortioCreated: z.boolean(),
  brandedLink: z.string().trim().optional(),
  destinationLink: z.string().trim().optional(),
  affiliateStatus: z.string().trim().optional(),
  frenchSlug: z.string().trim().optional(),
  frenchLink: z.string().trim().optional(),
  followUpNeeded: z.boolean(),
  notes: z.string().trim().optional(),
  accountPlan: z.string().trim().optional(),
});

function readAffiliateProgramForm(formData: FormData) {
  const raw = {
    tab: String(formData.get("tab") ?? ""),
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? "").trim() || undefined,
    category: String(formData.get("category") ?? "").trim() || undefined,
    shortioCreated: formData.get("shortioCreated") === "on",
    brandedLink: String(formData.get("brandedLink") ?? "").trim() || undefined,
    destinationLink: String(formData.get("destinationLink") ?? "").trim() || undefined,
    affiliateStatus: String(formData.get("affiliateStatus") ?? "").trim() || undefined,
    frenchSlug: String(formData.get("frenchSlug") ?? "").trim() || undefined,
    frenchLink: String(formData.get("frenchLink") ?? "").trim() || undefined,
    followUpNeeded: formData.get("followUpNeeded") === "on",
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    accountPlan: String(formData.get("accountPlan") ?? "").trim() || undefined,
  };
  return AffiliateProgramSchema.parse(raw);
}

export async function createAffiliateProgram(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readAffiliateProgramForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  const program = await withScopedPrismaClient((db) => db.affiliateProgram.create({ data }));

  revalidatePath("/marketing");
  redirect(`/marketing#${program.id}`);
}

export async function updateAffiliateProgram(
  programId: string,
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readAffiliateProgramForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  await withScopedPrismaClient((db) => db.affiliateProgram.update({ where: { id: programId }, data }));

  revalidatePath("/marketing");
  redirect(`/marketing#${programId}`);
}

export async function deleteAffiliateProgram(programId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");

  await withScopedPrismaClient((db) => db.affiliateProgram.delete({ where: { id: programId } }));
  revalidatePath("/marketing");
  redirect("/marketing");
}
