// The price list's descriptions start with an internal "Range $X-$Y CAD." note;
// what a client should read is the rest.
export function clientFacingDescription(description: string | null | undefined): string {
  return (description ?? "").replace(/^\s*(Range|Base rate)[^.]*?(CAD|USD|EUR|GBP)[^.]*\.\s*/i, "").trim();
}
