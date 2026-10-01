"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { TEMPLATE_TYPES, sanitizeConfig, type TemplateConfig } from "@/lib/project-templates";

function checkType(type: string) {
  if (!(TEMPLATE_TYPES as readonly string[]).includes(type)) throw new Error("Unknown project type");
}

export async function saveProjectTemplate(type: string, config: TemplateConfig): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  checkType(type);
  const clean = sanitizeConfig(config);
  await withScopedPrismaClient((db) =>
    db.projectTypeTemplate.upsert({
      where: { type: type as never },
      update: { config: clean as never },
      create: { type: type as never, config: clean as never },
    })
  );
  revalidatePath("/project-types");
  revalidatePath("/projects/new");
  return {};
}

// Back to the built-in default for this type.
export async function resetProjectTemplate(type: string): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  checkType(type);
  await withScopedPrismaClient((db) => db.projectTypeTemplate.deleteMany({ where: { type: type as never } }));
  revalidatePath("/project-types");
  revalidatePath("/projects/new");
}
