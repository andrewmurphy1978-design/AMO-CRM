import type { PrismaClient } from "@/lib/prisma";
import { getStripeConfig, payLinkFor } from "@/lib/stripe";
import { publicBaseUrl } from "@/lib/twilio";
import { jurisdictionOf } from "@/lib/jurisdiction";
import { getDict } from "@/lib/i18n/dictionaries";
import { getProjectTemplate } from "@/lib/project-template-store";
import { displayValue, isFieldVisible, typesOfProject, valuesOfType } from "@/lib/project-templates";
import type { InvoicePdfData, PdfAttachment, ProposalPdfData } from "@/lib/proposal-pdf";
import { proposalSupplierCosts } from "@/lib/supplier-costs";
import { getTypeLabels } from "@/lib/project-type-store";
import { signPath } from "@/lib/signed-url";
import { localizeInstalmentLabel, localizeText, localizeValue } from "@/lib/project-i18n";
import { clientFacingDescription } from "@/lib/catalog-text";
import { translateToFrench } from "@/lib/translate-cache";
import { LOGO_FULL_EN_B64, LOGO_FULL_FR_B64 } from "@/lib/logo-assets";
import { contactTaxLocation } from "@/lib/billing-totals";
import { computeSectionedTotals } from "@/lib/proposal-sections";

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
}, billing: boolean) {
  // The billing address / contact / email are for invoices only; proposals use the main ones.
  const useBilling = billing && Boolean(c.billingAddress || c.billingCity);
  const [street, city, state, zip, country] = useBilling
    ? [c.billingAddress, c.billingCity, c.billingState, c.billingZip, c.billingCountry]
    : [c.address, c.city, c.state, c.zip, c.country];
  // Street on the first line, "City Province Postal code" on the second, country third.
  const addr = [street, [city, state, zip].filter(Boolean).join(" "), country].filter(Boolean).join("\n");
  return {
    name: (billing && c.billingContactName) || [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || c.email || "",
    company: c.company,
    email: (billing && c.billingEmail) || c.email,
    phone: c.phone,
    address: addr,
  };
}

// A French client reads French: the price list's own French wording (when the line was picked from it)
// replaces the English name / client description saved on the line; anything else goes through the
// template dictionary and is otherwise left as written.
type CatalogRow = { name: string; description: string | null; clientDescription: string | null; nameFr: string | null; clientDescriptionFr: string | null };
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
function localizeLine<T extends { description: string; details?: string | null }>(li: T, catalog: CatalogRow[], lang: "en" | "fr"): T {
  if (lang !== "fr") return li;
  const item = catalog.find((c) => norm(c.name) === norm(li.description) || norm(c.nameFr) === norm(li.description));
  const description = item?.nameFr && norm(item.name) === norm(li.description) ? item.nameFr : localizeText(li.description, "fr");
  let details = li.details ?? null;
  if (details) {
    const sameAsEnglish = [item?.clientDescription, clientFacingDescription(item?.description)].some((d) => d && norm(d) === norm(details));
    details = sameAsEnglish && item?.clientDescriptionFr ? item.clientDescriptionFr : localizeText(details, "fr");
  }
  return { ...li, description, details };
}

// Free texts typed in English (lines that did not come from the price list, custom instalment labels, notes...)
// are machine-translated for a French client, once each (cached). A text already in French is left alone, and
// if the AI is unavailable the original is kept, so a PDF is never blocked.
async function frenchify(db: PrismaClient, data: ProposalPdfData | InvoicePdfData): Promise<void> {
  const proposal = data as ProposalPdfData;
  const texts: (string | null | undefined)[] = [data.notes];
  for (const li of data.lineItems) texts.push(li.description, li.details);
  for (const x of proposal.subscriptions ?? []) texts.push(x.name, x.note);
  for (const r of proposal.instalments ?? []) texts.push(r.label);
  for (const sec of proposal.sections ?? []) {
    texts.push(sec.title);
    for (const li of sec.lineItems) texts.push(li.description, li.details);
    for (const r of sec.instalments) texts.push(r.label);
  }
  const map = await translateToFrench(db, texts.filter((x): x is string => Boolean(x && x.trim())));
  if (map.size === 0) return;
  const tr = <T extends string | null | undefined>(x: T): T => ((x && map.get(x.trim())) || x) as T;
  data.notes = tr(data.notes);
  for (const li of data.lineItems) {
    li.description = tr(li.description);
    li.details = tr(li.details);
  }
  for (const x of proposal.subscriptions ?? []) {
    x.name = tr(x.name);
    x.note = tr(x.note);
  }
  for (const r of proposal.instalments ?? []) r.label = tr(r.label);
  for (const sec of proposal.sections ?? []) {
    sec.title = tr(sec.title);
    for (const li of sec.lineItems) {
      li.description = tr(li.description);
      li.details = tr(li.details);
    }
    for (const r of sec.instalments) r.label = tr(r.label);
  }
}

export async function loadProposalPdfData(db: PrismaClient, projectId: string, proposalId: string): Promise<{ data: ProposalPdfData; fileName: string } | null> {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: { lineItems: { orderBy: { order: "asc" } }, paymentSchedule: { orderBy: { order: "asc" } }, sections: { orderBy: { order: "asc" } } },
  });
  if (!proposal || proposal.projectId !== projectId) return null;
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      contact: true,
      phases: { orderBy: { order: "asc" }, include: { tasks: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!project) return null;
  const settings = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  const lang: "en" | "fr" = (project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
  const dict = getDict(lang);
  const typeLabels = await getTypeLabels(db, dict.projectTypes as Record<string, string>, lang);
  const catalog: CatalogRow[] = lang === "fr" ? await db.servicePriceListItem.findMany({ select: { name: true, description: true, clientDescription: true, nameFr: true, clientDescriptionFr: true } }) : [];
  // "Prepared for": the chosen recipient (a linked contact, a specific email / address) or the client.
  const recipient = proposal.recipientContactId && proposal.recipientContactId !== project.contactId ? await db.contact.findUnique({ where: { id: proposal.recipientContactId } }) : null;
  const client = {
    ...clientBlock(recipient ?? project.contact, false),
    ...(proposal.recipientEmail ? { email: proposal.recipientEmail } : {}),
    ...(proposal.recipientAddress ? { address: proposal.recipientAddress } : {}),
  };
  const types = typesOfProject(project);
  const typeBlocks = await Promise.all(types.map(async (type) => ({ type, template: await getProjectTemplate(db, type), answers: valuesOfType(project, type) })));

  // The plan to present: phases already created (apart from the Proposal phase
  // itself) followed by the phases still to come.
  const pending = Array.isArray(project.pendingPhases) ? (project.pendingPhases as { name: string; tasks: string[] }[]) : [];
  const existing = project.phases
    .filter((p) => !/^(proposal|proposition)$/i.test(p.name))
    .map((p) => ({ name: localizeText(p.name, lang), tasks: p.tasks.map((tk) => tk.title).filter((x) => !INTERNAL_TASK.test(x)).map((x) => localizeText(x, lang)) }));
  const plan = [...existing, ...pending.filter((p) => !/^final payment$/i.test(p.name)).map((p) => ({ name: localizeText(p.name, lang), tasks: p.tasks.filter((x) => !INTERNAL_TASK.test(x)).map((x) => localizeText(x, lang)) }))];

  const grand = proposal.subtotal + proposal.taxAmount;
  // A sectioned proposal: each section is taxed on its own and its instalments are a share of its own total.
  const sectioned = proposal.layout === "SECTIONED" && proposal.sections.length > 0;
  const sectionRows = proposal.sections.map((sec) => ({
    sec,
    lineItems: proposal.lineItems.filter((li) => li.sectionId === sec.id),
    rows: proposal.paymentSchedule.filter((r) => r.sectionId === sec.id),
  }));
  const sectionTotals = sectioned
    ? computeSectionedTotals(
        sectionRows.map((r) => ({ lineItems: r.lineItems, instalments: r.rows })),
        contactTaxLocation(project.contact),
        settings.chargeCanadianTax
      )
    : null;
  // Sectioned proposal: which phases and detail answers belong to which section. Phases of one type are
  // named "<Type> — <Phase>" when the project combines several types; the shared planning phases (Brand,
  // Research, Mock-up, presenting the reports) go to the Brand/Research/Mock-up section, and the shared
  // Presenting / Deploying phases are repeated under every type (each type is presented and launched).
  const rawPhases = [
    ...project.phases.filter((p) => !/^(proposal|proposition)$/i.test(p.name)).map((p) => ({ name: p.name, tasks: p.tasks.map((tk) => tk.title).filter((x) => !INTERNAL_TASK.test(x)) })),
    ...pending.filter((p) => !/^final payment$/i.test(p.name)).map((p) => ({ name: p.name, tasks: p.tasks.filter((x) => !INTERNAL_TASK.test(x)) })),
  ];
  const localized = (ph: { name: string; tasks: string[] }) => ({ name: localizeText(ph.name, lang), tasks: ph.tasks.map((x) => localizeText(x, lang)) });
  const SHARED_PREP = /^(brand|research|mock-up|2nd instalment|present the reports( and mock-ups)?)$/i;
  const SHARED_CLOSE = /^(presenting|deploying)$/i;
  const SKIPPED = /^(final payment|training)$/i;
  const labelsOf = (type: string) => [typeLabels[type], (getDict("en").projectTypes as Record<string, string>)[type], (getDict("fr").projectTypes as Record<string, string>)[type], type].filter(Boolean) as string[];
  const phasesOfType = (type: string) =>
    rawPhases.flatMap((ph) => {
      const prefix = labelsOf(type).find((l) => ph.name.startsWith(`${l} — `));
      if (prefix) return [{ ...ph, name: ph.name.slice(prefix.length + 3) }];
      if (SHARED_CLOSE.test(ph.name.trim())) return [ph];
      if (types.length === 1 && !SHARED_PREP.test(ph.name.trim()) && !SKIPPED.test(ph.name.trim())) return [ph];
      return [];
    });
  // Default section titles are saved in the language of the CRM screen they were created in: show them in the client's.
  const sectionTitle = (sec: { title: string; kind: string }) => {
    if (sec.kind === "PREP") {
      const defaults = [getDict("en").proposals.prepSection, getDict("fr").proposals.prepSection];
      return defaults.some((d) => norm(d) === norm(sec.title)) ? dict.proposals.prepSection : sec.title;
    }
    const names = [(getDict("en").projectTypes as Record<string, string>)[sec.kind], (getDict("fr").projectTypes as Record<string, string>)[sec.kind], typeLabels[sec.kind]];
    return names.some((n) => n && norm(n) === norm(sec.title)) ? (typeLabels[sec.kind] ?? sec.title) : sec.title;
  };
  const sections = sectionTotals
    ? sectionRows.map((r, i) => ({
        title: sectionTitle(r.sec),
        kind: r.sec.kind,
        ...(r.sec.kind === "PREP"
          ? {
              coveredTypes: types.map((ty) => typeLabels[ty] ?? ty),
              plan: rawPhases.filter((ph) => SHARED_PREP.test(ph.name.trim())).map(localized),
            }
          : {
              details: (() => {
                const block = typeBlocks.find((b) => b.type === r.sec.kind);
                return block
                  ? block.template.fields
                      .filter((f) => f.type !== "spacer")
                      .filter((f) => isFieldVisible(f, block.answers, block.template.fields))
                      .map((f) => ({ label: localizeText(f.label, lang), value: localizeValue(displayValue(block.answers[f.key]), lang) }))
                      .filter((d) => d.value)
                  : [];
              })(),
              plan: types.includes(r.sec.kind) ? phasesOfType(r.sec.kind).map(localized) : [],
            }),
        lineItems: r.lineItems.map((li) => localizeLine({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice }, catalog, lang)),
        subtotal: sectionTotals.sections[i].subtotal,
        taxes: sectionTotals.sections[i].total,
        totalAmount: sectionTotals.sections[i].totalAmount,
        instalments: r.rows.map((row, j) => ({ label: localizeInstalmentLabel(row.label, lang), percentage: row.percentage, amount: sectionTotals.sections[i].instalmentAmounts[j], dueDate: row.dueDate })),
      }))
    : undefined;
  const instalments = sections
    ? sections.flatMap((sec) => sec.instalments.map((row) => ({ ...row, label: `${sec.title} — ${row.label}` })))
    : proposal.paymentSchedule.map((r) => ({
        label: localizeInstalmentLabel(r.label, lang),
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
    client,
    project: {
      name: project.name,
      typeLabel: types.map((ty) => typeLabels[ty] ?? ty).join(" · "),
      typeLabels: types.map((ty) => typeLabels[ty] ?? ty),
      description: project.description,
      startDate: project.startDate,
      dueDate: project.dueDate,
    },
    // Each type's details, under the type's name when the project combines several.
    details: typeBlocks.flatMap(({ type, template, answers }) =>
      template.fields
        .filter((f) => f.type !== "spacer")
        .filter((f) => isFieldVisible(f, answers, template.fields))
        .map((f) => ({ label: localizeText(f.label, lang), value: localizeValue(displayValue(answers[f.key]), lang), group: types.length > 1 ? typeLabels[type] ?? type : undefined }))
        .filter((d) => d.value)
    ),
    coverLetter: proposal.coverLetter,
    plan,
    lineItems: proposal.lineItems.map((li) => localizeLine({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice }, catalog, lang)),
    subscriptions: (Array.isArray(proposal.subscriptions) ? proposal.subscriptions : []) as { name: string; amount: number; period: string; note: string }[],
    supplierCosts: costs.map((c) => ({ supplier: c.supplier, reference: c.reference, description: c.description, total: c.totalAmount, currency: c.currency })),
    attachments,
    totals: { subtotal: proposal.subtotal, gst: proposal.gstAmount, qst: proposal.qstAmount, hst: proposal.hstAmount, total: proposal.taxAmount },
    instalments,
    payment: { interac: Boolean(settings.interacEmail), card: Boolean(settings.cardPaymentUrl) || Boolean(await getStripeConfig(db)) },
    sections,
    notes: proposal.notes,
  };
  if (lang === "fr") await frenchify(db, data);
  return { data, fileName: `${number}-${project.name}`.replace(/[^\w.-]+/g, "-") };
}

export async function loadInvoicePdfData(db: PrismaClient, projectId: string, invoiceId: string): Promise<{ data: InvoicePdfData; fileName: string } | null> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { lineItems: { orderBy: { order: "asc" } }, instalment: { include: { proposal: { include: { paymentSchedule: { orderBy: { order: "asc" } } } } } } },
  });
  if (!invoice || invoice.projectId !== projectId) return null;
  const project = await db.project.findUnique({ where: { id: projectId }, include: { contact: true } });
  const invoiceRecipient = invoice.recipientContactId && project && invoice.recipientContactId !== project.contactId ? await db.contact.findUnique({ where: { id: invoice.recipientContactId } }) : null;
  if (!project) return null;
  const settings = await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } });
  const lang: "en" | "fr" = (project.contact.locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
  const invoiceCatalog: CatalogRow[] = lang === "fr" ? await db.servicePriceListItem.findMany({ select: { name: true, description: true, clientDescription: true, nameFr: true, clientDescriptionFr: true } }) : [];

  let instalmentLabel: string | null = null;
  if (invoice.instalment) {
    const rows = invoice.instalment.proposal.paymentSchedule;
    const idx = rows.findIndex((r) => r.id === invoice.instalmentId);
    instalmentLabel = `${lang === "fr" ? "Versement" : "Instalment"} ${idx + 1} ${lang === "fr" ? "de" : "of"} ${rows.length} — ${localizeInstalmentLabel(invoice.instalment.label, lang)}`;
  }
  // Where this instalment sits in the contract: the invoices already issued for the earlier
  // instalments, and what is left to invoice after this one.
  let instalment: InvoicePdfData["instalment"] = null;
  if (invoice.instalment) {
    const rows = invoice.instalment.proposal.paymentSchedule;
    const idx = rows.findIndex((r) => r.id === invoice.instalmentId);
    const earlier = rows.slice(0, Math.max(0, idx)).map((r) => r.id);
    const previous = earlier.length > 0 ? await db.invoice.findMany({ where: { instalmentId: { in: earlier } }, orderBy: { createdAt: "asc" } }) : [];
    const prevRows = previous.map((p) => ({
      number: p.number || `INV-${p.createdAt.toISOString().slice(0, 10).replace(/-/g, "")}-${p.id.slice(-4).toUpperCase()}`,
      date: p.invoiceDate ?? p.sentAt ?? p.createdAt,
      subtotal: p.subtotal,
      tax: p.taxAmount,
      total: p.totalAmount || p.amount,
      paid: p.status === "PAID",
    }));
    const contractTotal = invoice.instalment.proposal.totalAmount;
    const thisTotal = invoice.totalAmount || invoice.amount;
    instalment = {
      n: idx + 1,
      of: rows.length,
      final: idx === rows.length - 1,
      contractTotal,
      previous: prevRows,
      thisTotal,
      balance: contractTotal - prevRows.reduce((s, p) => s + p.total, 0) - thisTotal,
    };
  }
  const jurisdiction = jurisdictionOf(((invoiceRecipient ?? project.contact).billingCountry && (invoiceRecipient ?? project.contact).billingCity ? (invoiceRecipient ?? project.contact).billingCountry : (invoiceRecipient ?? project.contact).country) ?? null);
  const payBase = publicBaseUrl();
  const payUrl = payBase && invoice.status !== "PAID" && invoice.status !== "DRAFT" && invoice.status !== "CANCELED" && (await getStripeConfig(db)) ? await payLinkFor(payBase, invoice.id) : null;
  const billed = await db.projectSupplierInvoice.findMany({ where: { billedInvoiceId: invoice.id } });
  const attachments: PdfAttachment[] = billed
    .filter((c) => c.fileData && c.fileMime)
    .map((c) => ({ label: `${lang === "fr" ? "Facture du fournisseur" : "Supplier invoice"} — ${c.supplier}${c.reference ? ` #${c.reference}` : ""}`, mime: c.fileMime as string, data: c.fileData as unknown as Uint8Array }));
  const number = invoice.number || `INV-${invoice.createdAt.toISOString().slice(0, 10).replace(/-/g, "")}-${invoice.id.slice(-4).toUpperCase()}`;
  const data: InvoicePdfData = {
    lang,
    logoPng: fullLogo(lang),
    number,
    date: invoice.invoiceDate ?? invoice.sentAt ?? invoice.createdAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
    currency: invoice.currency,
    company: { ...COMPANY, gstNumber: settings.gstNumber, qstNumber: settings.qstNumber },
    client: {
      ...clientBlock(invoiceRecipient ?? project.contact, true),
      ...(invoice.recipientEmail ? { email: invoice.recipientEmail } : {}),
      ...(invoice.recipientAddress ? { address: invoice.recipientAddress } : {}),
    },
    projectName: project.name,
    instalmentLabel,
    instalment,
    jurisdiction,
    payUrl,
    lineItems: invoice.lineItems.map((li) => localizeLine({ description: li.description, details: li.details, quantity: li.quantity, unitPrice: li.unitPrice }, invoiceCatalog, lang)),
    attachments,
    totals: { subtotal: invoice.subtotal, gst: invoice.gstAmount, qst: invoice.qstAmount, hst: invoice.hstAmount, total: invoice.taxAmount },
    notes: invoice.notes,
  };
  if (lang === "fr") await frenchify(db, data);
  return { data, fileName: `${number}-${project.name}`.replace(/[^\w.-]+/g, "-") };
}

// A signed, expiring link to a PDF the client can open without logging in.
export async function signedDocumentUrl(origin: string, path: string, days = 30): Promise<string> {
  const { exp, sig } = await signPath(path, days * 86400);
  return `${origin}${path}?exp=${exp}&sig=${sig}`;
}
