// Which invoicing rules apply, from a contact's country (free text on the contact).
export type Jurisdiction = "CA" | "US" | "GB" | "FR" | "OTHER";

export function jurisdictionOf(country: string | null | undefined): Jurisdiction {
  const c = (country ?? "").trim().toLowerCase().replace(/\./g, "");
  if (!c) return "OTHER";
  if (["ca", "can", "canada"].includes(c)) return "CA";
  if (["us", "usa", "united states", "united states of america", "états-unis", "etats-unis", "états-unis d'amérique"].includes(c)) return "US";
  if (["gb", "uk", "united kingdom", "great britain", "england", "scotland", "wales", "northern ireland", "royaume-uni"].includes(c)) return "GB";
  if (["fr", "france", "république française"].includes(c)) return "FR";
  return "OTHER";
}
