import { computeBillingTotals, type BillingTotals } from "./billing-totals";

// A section's kind: "PREP" (Brand, Research & Mock-up) or a project type key.
export const PREP_KIND = "PREP";

export interface SectionLineItem {
  description: string;
  details?: string | null;
  quantity: number;
  unitPrice: number;
}

export interface SectionInstalment {
  label: string;
  percentage: number | null;
  amount: number | null;
  dueDate: string | null;
}

export interface ProposalSectionInput {
  title: string;
  kind: string;
  lineItems: SectionLineItem[];
  instalments: SectionInstalment[];
}

type Location = { country: string | null; province: string | null };

// What totals need — the instalment due date is irrelevant, so DB rows (Date)
// and form input (string) both fit.
type TotalsInput = {
  lineItems: { quantity: number; unitPrice: number }[];
  instalments: Pick<SectionInstalment, "percentage" | "amount">[];
};

export interface SectionTotals extends BillingTotals {
  // Resolved instalment amounts (tax included), same order as the input.
  instalmentAmounts: number[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSectionTotals(section: TotalsInput, location: Location, chargeCanadianTax: boolean): SectionTotals {
  const totals = computeBillingTotals(section.lineItems, location, chargeCanadianTax);
  const instalmentAmounts = section.instalments.map((i) =>
    i.amount != null ? round2(i.amount) : i.percentage != null ? round2((totals.totalAmount * i.percentage) / 100) : 0
  );
  return { ...totals, instalmentAmounts };
}

// A sectioned proposal's grand total is the sum of its sections' own (separately
// taxed) totals, so the final summary always adds up exactly.
export function computeSectionedTotals(sections: TotalsInput[], location: Location, chargeCanadianTax: boolean): { sections: SectionTotals[]; grand: BillingTotals } {
  const perSection = sections.map((s) => computeSectionTotals(s, location, chargeCanadianTax));
  const sum = (key: keyof BillingTotals) => round2(perSection.reduce((acc, s) => acc + s[key], 0));
  return {
    sections: perSection,
    grand: { subtotal: sum("subtotal"), gst: sum("gst"), qst: sum("qst"), hst: sum("hst"), total: sum("total"), totalAmount: sum("totalAmount") },
  };
}

// Instalment structure seeded for a new section: the Brand/Research/Mock-up
// section carries the first (deposit) instalment, and each project-type
// section its own 2nd and 3rd. All freely editable afterwards.
export function defaultInstalmentsFor(kind: string, labels: { deposit: string; startBuild: string; beforeLaunch: string }): SectionInstalment[] {
  if (kind === PREP_KIND) return [{ label: labels.deposit, percentage: 100, amount: null, dueDate: null }];
  return [
    { label: labels.startBuild, percentage: 50, amount: null, dueDate: null },
    { label: labels.beforeLaunch, percentage: 50, amount: null, dueDate: null },
  ];
}
