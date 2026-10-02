"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { TEMPLATE_TYPES, sanitizeConfig, type TemplateConfig } from "@/lib/project-templates";

async function checkType(db: PrismaClient, type: string) {
  if ((TEMPLATE_TYPES as readonly string[]).includes(type)) return;
  if (!(await db.customProjectType.findUnique({ where: { key: type } }))) throw new Error("Unknown project type");
}

export async function saveProjectTemplate(type: string, config: TemplateConfig): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const clean = sanitizeConfig(config);
  await withScopedPrismaClient(async (db) => {
    await checkType(db, type);
    await db.projectTypeTemplate.upsert({
      where: { type },
      update: { config: clean as never },
      create: { type, config: clean as never },
    });
  });
  revalidatePath("/project-types");
  revalidatePath("/projects/new");
  return {};
}

// Back to the built-in default for this type.
export async function resetProjectTemplate(type: string): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  await withScopedPrismaClient(async (db) => {
    await checkType(db, type);
    await db.projectTypeTemplate.deleteMany({ where: { type } });
  });
  revalidatePath("/project-types");
  revalidatePath("/projects/new");
}

// Adds a new project type (empty template; fill it in on the customization page).
export async function createProjectType(name: string, nameFr: string): Promise<{ error?: string; key?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const label = name.trim();
  if (!label) return { error: "Give the project type a name." };
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  if (!slug) return { error: "Use letters or numbers in the name." };
  const key = `CUSTOM_${slug}`;
  const result = await withScopedPrismaClient(async (db) => {
    if (await db.customProjectType.findUnique({ where: { key } })) return { error: "A project type with that name already exists." };
    const count = await db.customProjectType.count();
    await db.customProjectType.create({ data: { key, label, labelFr: nameFr.trim() || null, order: count } });
    await db.projectTypeTemplate.create({ data: { type: key, config: { fields: [], phases: [] } as never } });
    return { key };
  });
  revalidatePath("/project-types");
  revalidatePath("/projects");
  return result;
}

// Removes a type you added — only while no project uses it.
export async function deleteProjectType(key: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const result = await withScopedPrismaClient(async (db) => {
    if (!(await db.customProjectType.findUnique({ where: { key } }))) return { error: "Unknown project type" };
    const used = await db.project.count({ where: { type: key } });
    if (used > 0) return { error: `${used} project(s) use this type — change them first.` };
    await db.projectTypeTemplate.deleteMany({ where: { type: key } });
    await db.customProjectType.delete({ where: { key } });
    return {};
  });
  revalidatePath("/project-types");
  revalidatePath("/projects");
  return result;
}

// Saves the order of the project type list (drag and drop on the customization page).
export async function saveProjectTypeOrder(keys: string[]): Promise<void> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  await withScopedPrismaClient(async (db) => {
    const custom = await db.customProjectType.findMany({ select: { key: true } });
    const valid = new Set<string>([...TEMPLATE_TYPES, ...custom.map((c) => c.key)]);
    const clean = [...new Set(keys)].filter((k) => valid.has(k));
    await db.projectTypeOrder.deleteMany({});
    if (clean.length > 0) await db.projectTypeOrder.createMany({ data: clean.map((key, position) => ({ key, position })) });
  });
  revalidatePath("/project-types");
  revalidatePath("/projects");
  revalidatePath("/projects/new");
}
