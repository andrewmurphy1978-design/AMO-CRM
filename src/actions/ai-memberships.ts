"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { isPersonalSectionUser } from "@/lib/personal-watch";
import { getDict } from "@/lib/i18n/dictionaries";
import type { AiMembershipUsage } from "@prisma/client";

async function requirePersonalSectionUser() {
  const session = await auth();
  if (!session || !isPersonalSectionUser(session.user.email)) {
    throw new Error("Not authorized");
  }
  return session;
}

const USAGE_VALUES: AiMembershipUsage[] = ["DAILY", "WEEKLY", "MONTHLY", "RARELY"];

function readNumber(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readDate(formData: FormData, key: string): Date | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  // Stored as a Postgres DATE (no time component) — midnight UTC is what
  // Prisma hands back for that column type regardless of what's written here.
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readUsage(formData: FormData): AiMembershipUsage {
  const raw = String(formData.get("usage") ?? "").toUpperCase();
  return (USAGE_VALUES as string[]).includes(raw) ? (raw as AiMembershipUsage) : "MONTHLY";
}

export async function addAiMembership(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requirePersonalSectionUser();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: t.aiMemberships.nameRequired };

  const isFree = formData.get("isFree") === "on";
  const plan = String(formData.get("plan") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  await withScopedPrismaClient((db) =>
    db.aiMembership.create({
      data: {
        name,
        plan: plan || null,
        isFree,
        costUsdMonthly: isFree ? 0 : readNumber(formData, "costUsdMonthly"),
        costCadMonthly: isFree ? 0 : readNumber(formData, "costCadMonthly"),
        creditsAvailable: readNumber(formData, "creditsAvailable"),
        creditsPerMonth: readNumber(formData, "creditsPerMonth"),
        rolloverCredits: readNumber(formData, "rolloverCredits"),
        renewsAt: readDate(formData, "renewsAt"),
        usage: readUsage(formData),
        notes: notes || null,
      },
    })
  );

  revalidatePath("/ai-memberships");
  return { success: t.aiMemberships.save };
}

export async function updateAiMembership(id: string, formData: FormData): Promise<{ error?: string }> {
  const session = await requirePersonalSectionUser();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: t.aiMemberships.nameRequired };

  const isFree = formData.get("isFree") === "on";
  const plan = String(formData.get("plan") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  await withScopedPrismaClient((db) =>
    db.aiMembership.update({
      where: { id },
      data: {
        name,
        plan: plan || null,
        isFree,
        costUsdMonthly: isFree ? 0 : readNumber(formData, "costUsdMonthly"),
        costCadMonthly: isFree ? 0 : readNumber(formData, "costCadMonthly"),
        creditsAvailable: readNumber(formData, "creditsAvailable"),
        creditsPerMonth: readNumber(formData, "creditsPerMonth"),
        rolloverCredits: readNumber(formData, "rolloverCredits"),
        renewsAt: readDate(formData, "renewsAt"),
        usage: readUsage(formData),
        notes: notes || null,
      },
    })
  );

  revalidatePath("/ai-memberships");
  return {};
}

export async function deleteAiMembership(id: string): Promise<void> {
  await requirePersonalSectionUser();
  await withScopedPrismaClient((db) => db.aiMembership.delete({ where: { id } }));
  revalidatePath("/ai-memberships");
}
