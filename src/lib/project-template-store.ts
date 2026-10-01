import type { PrismaClient } from "@/lib/prisma";
import { TEMPLATE_TYPES, defaultTemplate, sanitizeConfig, type TemplateConfig } from "@/lib/project-templates";

// The saved template for a project type, or the built-in default.
export async function getProjectTemplate(db: PrismaClient, type: string): Promise<TemplateConfig> {
  const row = await db.projectTypeTemplate.findUnique({ where: { type: type as never } });
  return row ? sanitizeConfig(row.config) : defaultTemplate(type);
}

export async function getAllProjectTemplates(db: PrismaClient): Promise<Record<string, TemplateConfig>> {
  const rows = await db.projectTypeTemplate.findMany();
  const saved = new Map(rows.map((r) => [r.type as string, sanitizeConfig(r.config)]));
  const out: Record<string, TemplateConfig> = {};
  for (const type of TEMPLATE_TYPES) out[type] = saved.get(type) ?? defaultTemplate(type);
  return out;
}

export async function getSavedTypes(db: PrismaClient): Promise<string[]> {
  return (await db.projectTypeTemplate.findMany({ select: { type: true } })).map((r) => r.type as string);
}
