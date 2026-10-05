import type { PrismaClient } from "@/lib/prisma";
import { allTypeKeys } from "@/lib/project-type-store";
import { defaultTemplate, sanitizeConfig, withBrandField, type TemplateConfig } from "@/lib/project-templates";

// The saved template for a project type, or the built-in default.
export async function getProjectTemplate(db: PrismaClient, type: string): Promise<TemplateConfig> {
  const row = await db.projectTypeTemplate.findUnique({ where: { type } });
  return withBrandField(row ? sanitizeConfig(row.config) : defaultTemplate(type));
}

export async function getAllProjectTemplates(db: PrismaClient): Promise<Record<string, TemplateConfig>> {
  const rows = await db.projectTypeTemplate.findMany();
  const saved = new Map(rows.map((r) => [r.type as string, withBrandField(sanitizeConfig(r.config))]));
  const out: Record<string, TemplateConfig> = {};
  const custom = await db.customProjectType.findMany({ select: { key: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  for (const type of allTypeKeys(custom)) out[type] = saved.get(type) ?? withBrandField(defaultTemplate(type));
  return out;
}

export async function getSavedTypes(db: PrismaClient): Promise<string[]> {
  return (await db.projectTypeTemplate.findMany({ select: { type: true } })).map((r) => r.type as string);
}
