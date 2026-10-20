export function money(n: number, currency = "CAD", lang: "en" | "fr" = "en"): string {
  return new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
