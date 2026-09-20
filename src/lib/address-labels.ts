// The generic "State/Province" and "Zip/Postal code" labels don't match
// what most countries actually call these — shown instead once a country
// is selected, keyed by the exact country name strings in countries.ts.
const STATE_LABELS: Record<string, { en: string; fr: string }> = {
  Canada: { en: "Province", fr: "Province" },
  "United States": { en: "State", fr: "État" },
  France: { en: "Department", fr: "Département" },
  Australia: { en: "State/Territory", fr: "État/Territoire" },
  "United Kingdom": { en: "County", fr: "Comté" },
  Germany: { en: "State", fr: "État" },
  Austria: { en: "State", fr: "État" },
  Switzerland: { en: "Canton", fr: "Canton" },
  Mexico: { en: "State", fr: "État" },
  Brazil: { en: "State", fr: "État" },
  India: { en: "State", fr: "État" },
  Italy: { en: "Province", fr: "Province" },
  Spain: { en: "Province", fr: "Province" },
  Japan: { en: "Prefecture", fr: "Préfecture" },
  China: { en: "Province", fr: "Province" },
  Belgium: { en: "Province", fr: "Province" },
  Netherlands: { en: "Province", fr: "Province" },
  Ireland: { en: "County", fr: "Comté" },
  "New Zealand": { en: "Region", fr: "Région" },
  "South Africa": { en: "Province", fr: "Province" },
};

const ZIP_LABELS: Record<string, { en: string; fr: string }> = {
  Canada: { en: "Postal code", fr: "Code postal" },
  "United States": { en: "ZIP code", fr: "Code ZIP" },
  France: { en: "Postal code", fr: "Code postal" },
  "United Kingdom": { en: "Postcode", fr: "Code postal" },
  Ireland: { en: "Eircode", fr: "Eircode" },
  Germany: { en: "Postal code", fr: "Code postal" },
  Japan: { en: "Postal code", fr: "Code postal" },
};

const DEFAULT_STATE = { en: "State/Province", fr: "État/Province" };
const DEFAULT_ZIP = { en: "Zip/Postal code", fr: "Code postal" };

export function stateLabelForCountry(country: string | undefined, lang: "en" | "fr"): string {
  return (STATE_LABELS[country ?? ""] ?? DEFAULT_STATE)[lang];
}

export function zipLabelForCountry(country: string | undefined, lang: "en" | "fr"): string {
  return (ZIP_LABELS[country ?? ""] ?? DEFAULT_ZIP)[lang];
}
