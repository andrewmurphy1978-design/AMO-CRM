"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return { error: t.actions.userEmailExists };
  }

  const passwordHash = await hashPassword(data.password);
  await prisma.user.create({
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

  const existing = await prisma.user.findFirst({
    where: { email: data.email, NOT: { id: userId } },
  });
  if (existing) {
    return { error: t.actions.userEmailExistsOther };
  }

  // Admins can't change their own role away from Admin (would lock them out).
  const role = userId === session.user.id ? "ADMIN" : data.role;

  await prisma.user.update({
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
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  revalidatePath("/settings");
  return { password };
}

export async function deleteUser(userId: string) {
  const session = await requireAdmin();
  if (session.user.id === userId) {
    throw new Error("You cannot remove your own account.");
  }
  await prisma.user.delete({ where: { id: userId } });
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

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  const valid = await verifyPassword(data.currentPassword, user.passwordHash);
  if (!valid) {
    return { error: t.actions.passwordIncorrect };
  }

  const passwordHash = await hashPassword(data.newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return { success: t.actions.passwordUpdated };
}
