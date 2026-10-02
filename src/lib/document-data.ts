import type { PrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { getProjectTemplate } from "@/lib/project-template-store";
import { displayValue, isFieldVisible, type FieldValues } from "@/lib/project-templates";
import type { InvoicePdfData, PdfAttachment, ProposalPdfData } from "@/lib/proposal-pdf";
import { proposalSupplierCosts } from "@/lib/supplier-costs";
import { getTypeLabels } from "@/lib/project-type-store";
import { signPath } from "@/lib/signed-url";
import { localizeText, localizeValue } from "@/lib/project-i18n";
import { LOGO_FULL_EN_B64, LOGO_FULL_FR_B64 } from "@/lib/logo-assets";

// Gathers what the Proposal / Invoice PDFs need from the database.

export const COMPANY = { name: "Andrew Murphy Online", website: "andrewmurphy.online", email: "andrew@andrewmurphy.online" };
const INTERNAL_TASK = /instal|proposal|invoice|payment/i;

// Full horizontal AMO logo (EN / FR variant), embedded so PDFs never depend on a download.
function fullLogo(lang: "en" | "fr"): Uint8Array {
  const bin = atob(lang === "fr" ? LOGO_FULL_FR_B64 : LOGO_FULL_EN_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function clientBlock(c: {
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  billingCountry: string | null;
  billingContactName: string | null;
  billingEmail: string | null;
}) {
  const useBilling = Boolean(c.billingAddress || c.billingCity);
  const [street, city, state, zip, country] = useBilling
    ? [c.billingAddress, c.billingCity, c.billingState, c.billingZip, c.billingCountry]
    : [c.address, c.city, c.state, c.zip, c.country];
  // Street on the first line, "City Province Postal code" on the second, country third.
  const addr = [street, [city, state, zip].filter(Boolean).join(" "), country].filter(Boolean).join("\n");
  return {
    name: c.billingContactName || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || "",
    company: c.company,
    email: c.billingEmail || c.email,
    phone: c.phone,
    address: addr,
  };
}

export async function loadProposalPdfData(db: PrismaClient, projectId: string, proposalId: string): Promise<{ data: ProposalPdfData; fileName: string } | null> {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: { lineItems: { orderBy: { order: "asc" } }, paymentSchedule: { orderBy: { order: "asc" } } },
  });
  if (!proposal || proposal.projectId !== projectId) return null;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      contact: true,
      phases: { orderBy: { order: "asc" }, include: { tasks: { orderBy: { createdAt: "asc" } } } },
      linkedProjects: { orderBy: { createdAt: "asc" }, include: { phases: { orderBy: { order: "asc" }, include: { tasks: { orderBy: { createdAt: "asc" } } } } } },
    },
  });
  if (!project) return null;
  const settings = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  const lang: "en" | "fr" = (project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
  const dict = getDict(lang);
  const typeLabels = await getTypeLabels(db, dict.projectTypes as Record<string, string>, lang);
  const template = await getProjectTemplate(db, project.type);
  const answers = (project.customFields ?? {}) as FieldValues;

  // The plan to present: phases already created (apart from the Proposal phase
  // itself) followed by the phases still to come.
  const pending = Array.isArray(project.pendingPhases) ? (project.pendingPhases as { name: string; tasks: string[] }[]) : [];
  const existing = project.phases
    .filter((p) => !/^(proposal|proposition)$/i.test(p.name))
    .map((p) => ({ name: localizeText(p.name, lang), tasks: p.tasks.map((tk) => tk.title).filter((x) => !INTERNAL_TASK.test(x)).map((x) => localizeText(x, lang)) }));
  // Linked projects (Blog, Newsletters...) are part of this proposal: their phases and tasks follow.
  const linked = project.linkedProjects.flatMap((lp) =>
    lp.phases
      .filter((p) => !/^(proposal|proposition)$/i.test(p.name))
      .map((p) => ({ name: `${lp.name} — ${localizeText(p.name, lang)}`, tasks: p.tasks.map((tk) => tk.title).filter((x) => !INTERNAL_TASK.test(x)).map((x) => localizeText(x, lang)) }))
  );
  const plan = [...existing, ...linked, ...pending.filter((p) => !/^final payment$/i.test(p.name)).map((p) => ({ name: localizeText(p.name, lang), tasks: p.tasks.filter((x) => !INTERNAL_TASK.test(x)).map((x) => localizeText(x, lang)) }))];

  const grand = proposal.subtotal + proposal.taxAmount;
  const instalments = proposal.paymentSchedule.map((r) => ({
    label: r.label,
    percentage: r.percentage,
    amount: r.amount ?? (r.percentage != null ? Math.round(((r.percentage / 100) * grand) * 100) / 100 : 0),
    dueDate: r.dueDate,
  }));

  // Supplier invoices paid on the client's behalf before this proposal was issued.
  const costs = await proposalSupplierCosts(db, projectId, { sentAt: proposal.sentAt });
  const attachments: PdfAttachment[] = costs
    .filter((c) => c.fileData && c.fileMime)
    .map((c) => ({ label: `${lang === "fr" ? "Facture du fournisseur" : "Supplier invoice"} — ${c.supplier}${c.reference ? ` #${c.reference}` : ""}`, mime: c.fileMime as string, data: c.fileData as unknown as Uint8Array }));

  const stamp = proposal.createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  const number = `PR-${stamp}-${proposal.id.slice(-4).toUpperCase()}`;
  const data: ProposalPdfData = {
    lang,
    logoPng: fullLogo(lang),
    number,
    title: proposal.title,
    date: proposal.sentAt ?? new Date(),
    validDays: 30,
    currency: proposal.currency,
    company: { ...COMPANY, gstNumber: settings.gstNumber, qstNumber: settings.qstNumber },
    client: clientBlock(project.contact),
    project: {
      name: project.name,
      typeLabel: typeLabels[project.type] ?? project.type,
      description: project.description,
      startDate: project.startDate,
      dueDate: project.dueDate,
    },
    details: template.fields
      .filter((f) => f.type !== "spacer")
      .filter((f) => isFieldVisible(f, answers, template.fields))
      .map((f) => ({ label: localizeText(f.label, lang), value: localizeValue(displayValue(answers[f.key]), lang) }))
      .filter((d) => d.value),
    coverLetter: proposal.coverLetter,
    plan,
    lineItems: proposal.lineItems.map((li) => ({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice })),
    subscriptions: (Array.isArray(proposal.subscriptions) ? proposal.subscriptions : []) as { name: string; amount: number; period: string; note: string }[],
    supplierCosts: costs.map((c) => ({ supplier: c.supplier, reference: c.reference, description: c.description, total: c.totalAmount, currency: c.currency })),
    attachments,
    totals: { subtotal: proposal.subtotal, gst: proposal.gstAmount, qst: proposal.qstAmount, hst: proposal.hstAmount, total: proposal.taxAmount },
    instalments,
    notes: proposal.notes,
  };
  return { data, fileName: `${number}-${project.name}`.replace(/[^\w.-]+/g, "-") };
}

export async function loadInvoicePdfData(db: PrismaClient, projectId: string, invoiceId: string): Promise<{ data: InvoicePdfData; fileName: string } | null> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: { orderBy: { order: "asc" } }, instalment: { include: { proposal: { include: { paymentSchedule: { orderBy: { order: "asc" } } } } } } },
  });
  if (!invoice || invoice.projectId !== projectId) return null;
  const project = await db.project.findUnique({ where: { id: projectId }, include: { contact: true } });
  if (!project) return null;
  const settings = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  const lang: "en" | "fr" = (project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";

  let instalmentLabel: string | null = null;
  if (invoice.instalment) {
    const rows = invoice.instalment.proposal.paymentSchedule;
    const idx = rows.findIndex((r) => r.id === invoice.instalmentId);
    instalmentLabel = `${lang === "fr" ? "Versement" : "Instalment"} ${idx + 1} ${lang === "fr" ? "de" : "of"} ${rows.length} — ${invoice.instalment.label}`;
  }
  const billed = await db.projectSupplierInvoice.findMany({ where: { billedInvoiceId: invoice.id } });
  const attachments: PdfAttachment[] = billed
    .filter((c) => c.fileData && c.fileMime)
    .map((c) => ({ label: `${lang === "fr" ? "Facture du fournisseur" : "Supplier invoice"} — ${c.supplier}${c.reference ? ` #${c.reference}` : ""}`, mime: c.fileMime as string, data: c.fileData as unknown as Uint8Array }));
  const number = invoice.number || `INV-${invoice.createdAt.toISOString().slice(0, 10).replace(/-/g, "")}-${invoice.id.slice(-4).toUpperCase()}`;
  const data: InvoicePdfData = {
    lang,
    logoPng: fullLogo(lang),
    number,
    date: invoice.sentAt ?? invoice.createdAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    currency: invoice.currency,
    company: { ...COMPANY, gstNumber: settings.gstNumber, qstNumber: settings.qstNumber },
    client: clientBlock(project.contact),
    projectName: project.name,
    instalmentLabel,
    lineItems: invoice.lineItems.map((li) => ({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice })),
    attachments,
    totals: { subtotal: invoice.subtotal, gst: invoice.gstAmount, qst: invoice.qstAmount, hst: invoice.hstAmount, total: invoice.taxAmount },
    notes: invoice.notes,
  };
  return { data, fileName: `${number}-${project.name}`.replace(/[^\w.-]+/g, "-") };
}

// A signed, expiring link to a PDF the client can open without logging in.
export async function signedDocumentUrl(origin: string, path: string, days = 30): Promise<string> {
  const { exp, sig } = await signPath(path, days * 86400);
  return `${origin}${path}?exp=${exp}&sig=${sig}`;
}
