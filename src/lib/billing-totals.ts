import { computeCanadianTax, type CanadianTaxBreakdown } from "./canadian-tax";

export interface LineItemInput {
  quantity: number;
  unitPrice: number;
}

export interface BillingTotals extends CanadianTaxBreakdown {
  subtotal: number;
  totalAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeSubtotal(items: LineItemInput[]): number {
  return round2(items.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0));
}

// A Contact's taxable jurisdiction — the billing address when one is on
// file (it's the more likely place a client actually wants invoiced from),
// falling back to the main address otherwise.
export function contactTaxLocation(contact: {
  country?: string | null;
  state?: string | null;
  billingCountry?: string | null;
  billingState?: string | null;
}): { country: string | null; province: string | null } {
  return {
    country: contact.billingCountry || contact.country || null,
    province: contact.billingState || contact.state || null,
  };
}

export function computeBillingTotals(
  items: LineItemInput[],
  location: { country: string | null; province: string | null },
  chargeCanadianTax: boolean
): BillingTotals {
  const subtotal = computeSubtotal(items);
  const tax = computeCanadianTax(subtotal, location.country, location.province, chargeCanadianTax);
  return {
    subtotal,
    gst: round2(tax.gst),
    qst: round2(tax.qst),
    hst: round2(tax.hst),
    total: round2(tax.total),
    totalAmount: round2(subtotal + tax.total),
  };
}
