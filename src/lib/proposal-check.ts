import type { PrismaClient } from "@/lib/prisma";
import { getProjectTemplate } from "@/lib/project-template-store";
import { displayValue, isFieldVisible, typesOfProject, valuesOfType } from "@/lib/project-templates";
import { getTypeLabels } from "@/lib/project-type-store";
import { getDict } from "@/lib/i18n/dictionaries";

// What must be filled in before a proposal can be approved and sent to the client.
// Returns a readable list of what is missing (empty = ready).
export async function proposalIssues(db: PrismaClient, proposalId: string, lang: "en" | "fr"): Promise<string[]> {
  const fr = lang === "fr";
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: { lineItems: true, paymentSchedule: { orderBy: { order: "asc" } }, project: { include: { contact: true } } },
  });
  if (!proposal) return [fr ? "Soumission introuvable." : "Proposal not found."];
  const issues: string[] = [];
  const project = proposal.project;

  if (!proposal.coverLetter?.trim()) issues.push(fr ? "La lettre d'accompagnement est vide." : "The cover letter is empty.");
  if (proposal.lineItems.length === 0) issues.push(fr ? "Aucune ligne dans la section Investissement." : "There are no line items in the Investment section.");
  for (const li of proposal.lineItems) {
    if (!(li.unitPrice > 0)) issues.push(fr ? `La ligne « ${li.description || "sans nom"} » n'a pas de prix.` : `Line item "${li.description || "unnamed"}" has no price.`);
  }

  // Apps & subscriptions: every app needs its fee.
  const subs = (Array.isArray(proposal.subscriptions) ? proposal.subscriptions : []) as { name?: string; amount?: number }[];
  for (const s of subs) {
    if (!(typeof s.amount === "number" && s.amount > 0)) issues.push(fr ? `Applications et abonnements : le montant de « ${s.name || "sans nom"} » est manquant.` : `Apps & subscriptions: the fee for "${s.name || "unnamed"}" is missing.`);
  }

  // Payment schedule adds up to 100%.
  if (proposal.paymentSchedule.length === 0) issues.push(fr ? "Le calendrier de paiement est vide." : "The payment schedule is empty.");
  else {
    const pct = proposal.paymentSchedule.reduce((a, r) => a + (r.percentage ?? 0), 0);
    const anyFixed = proposal.paymentSchedule.some((r) => r.amount != null);
    if (!anyFixed && Math.abs(pct - 100) > 0.01) issues.push(fr ? `Le calendrier de paiement totalise ${pct}% au lieu de 100%.` : `The payment schedule adds up to ${pct}% instead of 100%.`);
  }

  // Project details: every visible detail of every type must be answered (long text and links are optional).
  const labels = await getTypeLabels(db, getDict(lang).projectTypes as Record<string, string>, lang);
  for (const type of typesOfProject(project)) {
    const template = await getProjectTemplate(db, type);
    const values = valuesOfType(project, type);
    const missing = template.fields
      .filter((f) => f.type !== "spacer" && f.type !== "textarea" && f.type !== "url" && isFieldVisible(f, values, template.fields))
      .filter((f) => !displayValue(values[f.key]).trim())
      .map((f) => f.label);
    if (missing.length > 0) issues.push(fr ? `Détails (${labels[type] ?? type}) à remplir : ${missing.join(", ")}.` : `Details (${labels[type] ?? type}) to fill in: ${missing.join(", ")}.`);
  }

  const c = project.contact;
  if (!(proposal.recipientEmail || c.email || c.email2 || c.extraEmails[0] || c.billingEmail)) issues.push(fr ? "Le client n'a pas de courriel." : "The client has no email address.");
  return issues;
}
