"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isPersonalSectionUser } from "@/lib/personal-watch";
import { getDict } from "@/lib/i18n/dictionaries";

async function requirePersonalSectionUser() {
  const session = await auth();
  if (!session || !isPersonalSectionUser(session.user.email)) {
    throw new Error("Not authorized");
  }
  return session;
}

export async function addPersonalWatchEmail(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requirePersonalSectionUser();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const personId = String(formData.get("personId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!personId || !email) {
    return { error: t.personal.emailRequired };
  }

  try {
    await prisma.personalWatchEmail.create({ data: { personId, email } });
  } catch {
    return { error: t.personal.emailDuplicate };
  }

  revalidatePath("/settings");
  revalidatePath("/personal");
  return { success: t.personal.emailSaved };
}

export async function updatePersonalWatchEmail(id: string, email: string): Promise<{ error?: string }> {
  const session = await requirePersonalSectionUser();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");
  const trimmed = email.trim();
  if (!id || !trimmed) {
    return { error: t.personal.emailRequired };
  }

  try {
    await prisma.personalWatchEmail.update({ where: { id }, data: { email: trimmed } });
  } catch {
    return { error: t.personal.emailDuplicate };
  }

  revalidatePath("/settings");
  revalidatePath("/personal");
  return {};
}

export async function deletePersonalWatchEmail(id: string): Promise<void> {
  await requirePersonalSectionUser();
  await prisma.personalWatchEmail.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/personal");
}
