"use server";

import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { brandFileEntries } from "@/lib/brand-zip";
import { BRAND_ITEMS } from "@/lib/brand-items";
import { buildPhasePrompt, phaseKind, type PromptContext } from "@/lib/phase-prompts";
import { getProjectTemplate } from "@/lib/project-template-store";
import { displayValue, isFieldVisible, typesOfProject, valuesOfType } from "@/lib/project-templates";
import { getTypeLabels } from "@/lib/project-type-store";

// The AI prompt for a phase (shown on the phase's first task): everything the CRM knows about
// the client, the project's details, the brand and the phase's tasks, ready to paste into an AI.
export async function generatePhasePrompt(projectId: string, phaseId: string): Promise<{ prompt?: string; error?: string; assetsZip?: { url: string; count: number } }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return withScopedPrismaClient(async (db) => {
    const project = await db.project.findUnique({ where: { id: projectId }, include: { contact: true } });
    const phase = await db.projectPhase.findUnique({ where: { id: phaseId }, include: { tasks: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
    if (!project || !phase || phase.projectId !== projectId) return { error: "Phase not found." };

    const labels = await getTypeLabels(db, getDict("en").projectTypes as Record<string, string>, "en");
    const types = typesOfProject(project);
    // "Website building — Building Pages": the type is in the prefix; shared phases have none.
    const sep = phase.name.indexOf(" — ");
    const prefix = sep > 0 ? phase.name.slice(0, sep) : "";
    const baseName = sep > 0 ? phase.name.slice(sep + 3) : phase.name;
    const type = (prefix && types.find((t) => labels[t] === prefix)) || types[0];
    const kind = phaseKind(baseName, type);
    if (!kind) return { error: "No AI prompt is available for this phase." };

    const blocks = await Promise.all(types.map(async (t) => ({ type: t, template: await getProjectTemplate(db, t), values: valuesOfType(project, t) })));
    const pick = (key: string) => [...new Set(blocks.flatMap((b) => { const v = b.values[key]; return Array.isArray(v) ? v : v ? [v] : []; }))];
    const brandRows = await db.contactBrandItem.findMany({ where: { contactId: project.contactId }, orderBy: [{ category: "asc" }, { order: "asc" }] });

    // Uploaded brand files are not pasted into the prompt (base64): they go in a zip to drag and drop.
    const files = brandFileEntries(brandRows);
    const fileName = new Map(files.map((f) => [f.id, f.name]));

    const ctx: PromptContext = {
      clientName: [project.contact.firstName, project.contact.lastName].filter(Boolean).join(" ") || project.contact.company || project.contact.email || "the client",
      company: project.contact.company ?? "",
      industry: project.contact.industry ?? "",
      website: project.contact.website ?? "",
      clientLanguage: (project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en",
      clientNotes: project.contact.aiDetails ?? "",
      projectName: project.name,
      projectDescription: project.description ?? "",
      projectNotes: project.notes ?? "",
      phaseName: phase.name,
      tasks: phase.tasks.map((t) => t.title),
      types: blocks.map((b) => ({
        label: labels[b.type] ?? b.type,
        details: b.template.fields
          .filter((f) => f.type !== "spacer" && isFieldVisible(f, b.values, b.template.fields))
          .map((f) => `${f.label}: ${displayValue(b.values[f.key])}`)
          .filter((l) => !l.endsWith(": ")),
      })),
      languages: pick("languages"),
      pages: pick("pages"),
      forms: pick("forms"),
      funnels: pick("funnels"),
      topics: pick("topics"),
      brandWanted: project.brandItems.map((k) => BRAND_ITEMS.find((b) => b.key === k)?.label ?? k),
      brandExisting: brandRows.map((r) => `- ${r.category} | ${r.label}${r.value ? ` | ${fileName.has(r.id) ? `file in the attached zip: ${fileName.get(r.id)}` : r.value}` : ""}`),
      brandZipAttached: files.length > 0,
    };
    return { prompt: buildPhasePrompt(kind, ctx), ...(files.length > 0 ? { assetsZip: { url: `/api/projects/${projectId}/brand-assets`, count: files.length } } : {}) };
  });
}
