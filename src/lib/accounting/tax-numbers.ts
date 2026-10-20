// The registration numbers an entity can hold. Several can apply at once (a Québec business can have a BN, a
// GST/HST number, a QST number and a NEQ; a business selling in BC, Manitoba or Saskatchewan also has a PST/RST
// number there; a US LLC has a federal EIN and one sales-tax permit per state where it collects tax).

export type TaxNumberType = "BN" | "GST_HST" | "QST" | "NEQ" | "BC_PST" | "MB_RST" | "SK_PST" | "EIN" | "STATE_SALES_TAX" | "STATE_ID";

export interface TaxNumber {
  type: TaxNumberType;
  number: string;
  // US state for the state-level numbers.
  region?: string;
}

export const TAX_NUMBER_TYPES: Record<TaxNumberType, { en: string; fr: string; countries: ("CA" | "US")[]; placeholder: string; region?: boolean }> = {
  BN: { en: "Business Number (CRA)", fr: "Numéro d'entreprise (ARC)", countries: ["CA"], placeholder: "123456789" },
  GST_HST: { en: "GST/HST number", fr: "N° de TPS/TVH", countries: ["CA"], placeholder: "123456789 RT0001" },
  QST: { en: "QST number (Revenu Québec)", fr: "N° de TVQ (Revenu Québec)", countries: ["CA"], placeholder: "1234567890 TQ0001" },
  NEQ: { en: "NEQ (Québec enterprise number)", fr: "NEQ (numéro d'entreprise du Québec)", countries: ["CA"], placeholder: "1234567890" },
  BC_PST: { en: "BC PST number", fr: "N° de TVP de la C.-B.", countries: ["CA"], placeholder: "PST-1234-5678" },
  MB_RST: { en: "Manitoba RST number", fr: "N° de TVD du Manitoba", countries: ["CA"], placeholder: "123456-7" },
  SK_PST: { en: "Saskatchewan PST number", fr: "N° de TVP de la Saskatchewan", countries: ["CA"], placeholder: "1234567" },
  EIN: { en: "EIN (federal employer ID)", fr: "EIN (n° d'employeur fédéral, É.-U.)", countries: ["US"], placeholder: "12-3456789" },
  STATE_SALES_TAX: { en: "State sales-tax permit", fr: "Permis de taxe de vente d'un État", countries: ["US"], placeholder: "Permit number", region: true },
  STATE_ID: { en: "State tax / employer ID", fr: "N° d'impôt / d'employeur d'un État", countries: ["US"], placeholder: "State ID", region: true },
};

export function typesFor(country: string): TaxNumberType[] {
  const c = country === "US" ? "US" : "CA";
  return (Object.keys(TAX_NUMBER_TYPES) as TaxNumberType[]).filter((t) => TAX_NUMBER_TYPES[t].countries.includes(c));
}

/** The entity's numbers, folding in the older single "tax number" as a GST/HST number. */
export function readTaxNumbers(raw: unknown, legacy: string | null, country: string): TaxNumber[] {
  const list = Array.isArray(raw) ? (raw as TaxNumber[]).filter((t) => t && t.type in TAX_NUMBER_TYPES && typeof t.number === "string" && t.number.trim()) : [];
  if (list.length === 0 && legacy) return [{ type: country === "US" ? "EIN" : "GST_HST", number: legacy }];
  return list;
}

/** Reads the repeated taxType / taxNumberValue / taxRegion fields of a submitted form. */
export function parseTaxNumbers(formData: FormData): TaxNumber[] {
  const types = formData.getAll("taxType").map(String);
  const numbers = formData.getAll("taxNumberValue").map(String);
  const regions = formData.getAll("taxRegion").map(String);
  const out: TaxNumber[] = [];
  types.forEach((type, i) => {
    const number = (numbers[i] ?? "").trim();
    if (!number || !(type in TAX_NUMBER_TYPES)) return;
    const region = (regions[i] ?? "").trim().toUpperCase();
    out.push({ type: type as TaxNumberType, number, ...(region ? { region } : {}) });
  });
  return out;
}
