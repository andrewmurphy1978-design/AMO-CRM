import type { PrismaClient } from "@/lib/prisma";
import { PROJECT_TYPE_ORDER } from "@/lib/project-templates";

// Project types added from the customization page (the built-in ones live in code).
export interface CustomProjectType {
  key: string;
  label: string;
  labelFr: string | null;
}

export async function getCustomProjectTypes(db: PrismaClient): Promise<CustomProjectType[]> {
  const rows = await db.customProjectType.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({ key: r.key, label: r.label, labelFr: r.labelFr }));
}

/** Built-in type labels (from the dictionary) plus the custom ones, for a language. */
export function mergeTypeLabels(base: Record<string, string>, custom: CustomProjectType[], lang: "en" | "fr"): Record<string, string> {
  const out: Record<string, string> = { ...base };
  for (const c of custom) out[c.key] = lang === "fr" && c.labelFr ? c.labelFr : c.label;
  return out;
}

export async function getTypeLabels(db: PrismaClient, base: Record<string, string>, lang: "en" | "fr"): Promise<Record<string, string>> {
  return mergeTypeLabels(base, await getCustomProjectTypes(db), lang);
}

/** Every type, default order: built-ins, then custom ones. */
export function allTypeKeys(custom: { key: string }[]): string[] {
  return [...PROJECT_TYPE_ORDER, ...custom.map((c) => c.key)];
}

/** The saved order (drag and drop) applied to the default list. */
export async function getOrderedTypeKeys(db: PrismaClient, custom: { key: string }[]): Promise<string[]> {
  const rows = await db.projectTypeOrder.findMany({ orderBy: { position: "asc" } });
  const all = allTypeKeys(custom);
  const saved = rows.map((r) => r.key).filter((k) => all.includes(k));
  return [...saved, ...all.filter((k) => !saved.includes(k))];
}

/** Labels and custom keys for server pages (opens its own scoped client). */
export async function loadTypeInfo(lang: "en" | "fr"): Promise<{ keys: string[]; labels: Record<string, string>; customKeys: string[]; custom: CustomProjectType[] }> {
  const { withScopedPrismaClient } = await import("@/lib/prisma");
  const { getDict } = await import("@/lib/i18n/dictionaries");
  const { custom, keys } = await withScopedPrismaClient(async (db) => {
    const custom = await getCustomProjectTypes(db);
    return { custom, keys: await getOrderedTypeKeys(db, custom) };
  });
  return {
    keys,
    labels: mergeTypeLabels(getDict(lang).projectTypes as Record<string, string>, custom, lang),
    customKeys: custom.map((c) => c.key),
    custom,
  };
}
