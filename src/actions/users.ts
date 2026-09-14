"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    throw new Error("Only admins can manage team members");
  }
  return session;
}

const NewUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export async function createUser(
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  await requireAdmin();

  let data;
  try {
    data = NewUserSchema.parse({
      name: String(formData.get("name") ?? "").trim(),
      email: String(formData.get("email") ?? "").trim().toLowerCase(),
      password: String(formData.get("password") ?? ""),
      role: String(formData.get("role") ?? "MEMBER"),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? "Invalid input" };
    }
    throw error;
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return { error: "A user with this email already exists." };
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  await prisma.user.create({
    data: { name: data.name, email: data.email, passwordHash, role: data.role },
  });

  revalidatePath("/settings");
  return { success: `Added ${data.name}.` };
}

export async function updateUserRole(userId: string, role: "ADMIN" | "MEMBER") {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings");
}

export async function deleteUser(userId: string) {
  const session = await requireAdmin();
  if (session.user.id === userId) {
    throw new Error("You cannot remove your own account.");
  }
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/settings");
}
