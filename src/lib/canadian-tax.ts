// Canadian sales tax on a Proposal/Invoice subtotal — GST+QST for Quebec,
// HST for the provinces that use it, GST only elsewhere in Canada, and no
// tax at all for anything outside Canada. Gated by BillingSettings —
// Andrew doesn't charge tax until his revenue crosses the $30,000 GST/HST
// registration threshold.
const GST_RATE = 0.05;
const QST_RATE = 0.09975;
// Current HST rates by province. Nova Scotia dropped from 15% to 14% on
// April 1, 2025 — if any other province's rate changes, update it here;
// nothing else in the tax calculation needs to change.
const HST_RATES: Record<string, number> = {
  ON: 0.13,
  NB: 0.15,
  NL: 0.15,
  NS: 0.14,
  PE: 0.15,
};

// Accepts a full province/territory name (English or French) or a 2-letter
// code, in any casing — Contact.state/billingState are free-text fields,
// not a constrained dropdown, so both forms show up in practice.
const PROVINCE_ALIASES: Record<string, string> = {
  alberta: "AB",
  ab: "AB",
  "british columbia": "BC",
  "colombie-britannique": "BC",
  bc: "BC",
  manitoba: "MB",
  mb: "MB",
  "new brunswick": "NB",
  "nouveau-brunswick": "NB",
  nb: "NB",
  "newfoundland and labrador": "NL",
  newfoundland: "NL",
  "terre-neuve-et-labrador": "NL",
  nl: "NL",
  "nova scotia": "NS",
  "nouvelle-écosse": "NS",
  "nouvelle-ecosse": "NS",
  ns: "NS",
  "northwest territories": "NT",
  "territoires du nord-ouest": "NT",
  nt: "NT",
  nunavut: "NU",
  nu: "NU",
  ontario: "ON",
  on: "ON",
  "prince edward island": "PE",
  "île-du-prince-édouard": "PE",
  "ile-du-prince-edouard": "PE",
  pe: "PE",
  pei: "PE",
  quebec: "QC",
  québec: "QC",
  qc: "QC",
  pq: "QC",
  saskatchewan: "SK",
  sk: "SK",
  yukon: "YT",
  yt: "YT",
};

export function normalizeProvinceCode(province?: string | null): string | null {
  if (!province) return null;
  return PROVINCE_ALIASES[province.trim().toLowerCase()] ?? null;
}

export interface CanadianTaxBreakdown {
  gst: number;
  qst: number;
  hst: number;
  total: number;
}

const ZERO_TAX: CanadianTaxBreakdown = { gst: 0, qst: 0, hst: 0, total: 0 };

// `country` should be the Contact's own country field (free text, e.g.
// "Canada"); anything else is treated as international and charged no tax
// regardless of the `chargeCanadianTax` gate.
export function computeCanadianTax(
  subtotal: number,
  country: string | null | undefined,
  province: string | null | undefined,
  chargeCanadianTax: boolean
): CanadianTaxBreakdown {
  if (!chargeCanadianTax) return ZERO_TAX;
  if (!country || country.trim().toLowerCase() !== "canada") return ZERO_TAX;

  const code = normalizeProvinceCode(province);
  if (code === "QC") {
    const gst = subtotal * GST_RATE;
    const qst = subtotal * QST_RATE;
    return { gst, qst, hst: 0, total: gst + qst };
  }
  if (code && HST_RATES[code]) {
    const hst = subtotal * HST_RATES[code];
    return { gst: 0, qst: 0, hst, total: hst };
  }
  // Any other Canadian province/territory, or an unrecognized/blank
  // province for a Canadian client — GST only.
  const gst = subtotal * GST_RATE;
  return { gst, qst: 0, hst: 0, total: gst };
}
