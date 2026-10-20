// The price list's descriptions start with an internal "Range $X-$Y CAD." note;
// what a client should read is the rest.
export function clientFacingDescription(description: string | null | undefined): string {
  return (description ?? "").replace(/^\s*(Range|Base rate)[^.]*?(CAD|USD|EUR|GBP)[^.]*\.\s*/i, "").trim();
}

// A price-list service as a document line, in the language of the document's reader (the French wording
// when the client reads French and the service has one).
export function catalogLine(
  item: { name: string; description: string | null; clientDescription?: string | null; nameFr?: string | null; clientDescriptionFr?: string | null },
  lang: "en" | "fr"
): { description: string; details: string } {
  const fr = lang === "fr";
  return {
    description: fr && item.nameFr ? item.nameFr : item.name,
    details: (fr && item.clientDescriptionFr) || item.clientDescription || clientFacingDescription(item.description),
  };
}
