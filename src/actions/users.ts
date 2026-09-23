"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getDict } from "@/lib/i18n/dictionaries";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage team members");
  }
  return session;
}

const ProfileFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  phone: z.string().trim().optional(),
  whatsapp: z.string().trim().optional(),
  country: z.string().trim().min(1).default("CA"),
  language: z.enum(["EN", "FR"]),
  role: z.enum(["ADMIN", "MEMBER"]),
});

function readProfileForm(formData: FormData) {
  return ProfileFieldsSchema.parse({
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "").trim() || undefined,
    whatsapp: String(formData.get("whatsapp") ?? "").trim() || undefined,
    country: String(formData.get("country") ?? "CA").trim(),
    language: String(formData.get("language") ?? "EN"),
    role: String(formData.get("role") ?? "MEMBER"),
  });
}

const NewUserSchema = ProfileFieldsSchema.extend({
  password: z.string().min(8, "Temporary password must be at least 8 characters"),
});

export async function createUser(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = NewUserSchema.parse({
      ...Object.fromEntries(
        Object.entries({
          name: String(formData.get("name") ?? "").trim(),
          email: String(formData.get("email") ?? "").trim().toLowerCase(),
          phone: String(formData.get("phone") ?? "").trim() || undefined,
          whatsapp: String(formData.get("whatsapp") ?? "").trim() || undefined,
          country: String(formData.get("country") ?? "CA").trim(),
          language: String(formData.get("language") ?? "EN"),
          role: String(formData.get("role") ?? "MEMBER"),
        })
      ),
      password: String(formData.get("password") ?? ""),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  const passwordHash = await hashPassword(data.password);
  const result = await withScopedPrismaClient(async (db) => {
    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) return { error: t.actions.userEmailExists };
    await db.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        phone: data.phone,
        whatsapp: data.whatsapp,
        country: data.country,
        language: data.language,
      },
    });
    return {};
  });
  if (result.error) return { error: result.error };

  revalidatePath("/settings");
  return { success: t.actions.userAdded(data.name) };
}

export async function updateUser(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await requireAdmin();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Missing user." };

  let data;
  try {
    data = readProfileForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  // Admins can't change their own role away from Admin (would lock them out).
  const role = userId === session.user.id ? "ADMIN" : data.role;

  const result = await withScopedPrismaClient(async (db) => {
    const existing = await db.user.findFirst({
      where: { email: data.email, NOT: { id: userId } },
    });
    if (existing) return { error: t.actions.userEmailExistsOther };
    await db.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        whatsapp: data.whatsapp,
        country: data.country,
        language: data.language,
        role,
      },
    });
    return {};
  });
  if (result.error) return { error: result.error };

  revalidatePath("/settings");
  return { success: t.actions.userSaved };
}

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function resetUserPassword(
  userId: string
): Promise<{ password?: string; error?: string }> {
  await requireAdmin();

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);
  await withScopedPrismaClient((db) => db.user.update({ where: { id: userId }, data: { passwordHash } }));

  revalidatePath("/settings");
  return { password };
}

export async function deleteUser(userId: string) {
  const session = await requireAdmin();
  if (session.user.id === userId) {
    throw new Error("You cannot remove your own account.");
  }
  await withScopedPrismaClient((db) => db.user.delete({ where: { id: userId } }));
  revalidatePath("/settings");
}

const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords don't match",
    path: ["confirmPassword"],
  });

export async function changePassword(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = ChangePasswordSchema.parse({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      confirmPassword: String(formData.get("confirmPassword") ?? ""),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  const result = await withScopedPrismaClient(async (db) => {
    const user = await db.user.findUniqueOrThrow({ where: { id: session.user.id } });
    const valid = await verifyPassword(data.currentPassword, user.passwordHash);
    if (!valid) return { error: t.actions.passwordIncorrect };
    const passwordHash = await hashPassword(data.newPassword);
    await db.user.update({ where: { id: user.id }, data: { passwordHash } });
    return {};
  });
  if (result.error) return { error: result.error };

  return { success: t.actions.passwordUpdated };
}

export async function saveTimeFormat(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const timeFormat = String(formData.get("timeFormat") ?? "");
  if (timeFormat !== "HOUR24" && timeFormat !== "HOUR12") {
    return { error: t.actions.invalidInput };
  }

  await withScopedPrismaClient((db) => db.user.update({ where: { id: session.user.id }, data: { timeFormat } }));
  revalidatePath("/settings");
  revalidatePath("/");

  return { success: t.actions.timeFormatSaved };
}

// Which connected mail account (MailSource: "gmail" | "ionos") the New
// Email compose dialog's From field preselects — see User.defaultComposeSource's
// own schema comment. Empty string clears the preference back to "no
// preference" (falls back to the same default-identity order
// src/lib/mail/identity.ts already uses).
export async function saveDefaultComposeAccount(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const value = String(formData.get("defaultComposeSource") ?? "");
  const defaultComposeSource = value === "gmail" || value === "ionos" ? value : null;

  await withScopedPrismaClient((db) => db.user.update({ where: { id: session.user.id }, data: { defaultComposeSource } }));
  revalidatePath("/settings");

  return { success: t.actions.composeAccountSaved };
}

// The compose editor's starting font — see User.defaultFontFamily/
// defaultFontSize's own schema comment. Both empty clears the preference
// back to the browser's own default.
export async function saveDefaultComposeFont(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const defaultFontFamily = String(formData.get("defaultFontFamily") ?? "").trim() || null;
  const defaultFontSize = String(formData.get("defaultFontSize") ?? "").trim() || null;

  await withScopedPrismaClient((db) => db.user.update({ where: { id: session.user.id }, data: { defaultFontFamily, defaultFontSize } }));
  revalidatePath("/settings");

  return { success: t.actions.composeFontSaved };
}

// Free-text rules layered on top of the Email page's Claude classification
// prompt (see src/lib/email-classifier.ts) — per-user since each team
// member's inbox is their own. Empty is valid (clears it back to the
// built-in categories only).
export async function saveEmailScreeningInstructions(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const instructions = String(formData.get("instructions") ?? "").trim();

  await withScopedPrismaClient((db) =>
    db.user.update({
      where: { id: session.user.id },
      data: { emailScreeningInstructions: instructions || null },
    })
  );
  revalidatePath("/settings");

  return { success: t.emailScreeningSettings.saved };
}
