// The supplier (company) name of a bank transaction, cleaned from the bank's description, and the key under which
// its categorization is remembered. "ACHAT PAYPAL *ADOBE 4029357733 QC 12/03" -> "Adobe".

// Words banks put in front of the merchant — never part of its name.
const NOISE_PREFIX = /^(achat|purchase|paiement|payment|pos|pre-?authorized|pre-?auth|preauthorized|debit|d[ée]bit|visa debit|visa|mastercard|interac|retrait|withdrawal|transfert|transfer|virement|e-?transfer|depot|d[ée]p[ôo]t|prelevement|pr[ée]l[èe]vement|point of sale|terminal|tpv|carte|card|sent|received|re[çc]u|envoy[ée]|from|to)\b[\s:/-]*/i;
const PAYMENT_PROCESSORS = /^(paypal|pp|sq|square|stripe|sp|tst|dd|doordash|uber\s*\*)\s*[*-]\s*/i;
const PROVINCES = "AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT";

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** The company name for display, from a raw bank description. */
export function supplierName(description: string): string {
  let s = (description ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // Peel the leading transaction-type words, possibly several ("ACHAT INTERAC ...").
  for (let i = 0; i < 3; i++) {
    const next = s.replace(NOISE_PREFIX, "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(PAYMENT_PROCESSORS, "");
  // "AMAZON.CA*2K4L9 ..." — a reference glued to the name with a star: keep the name.
  s = s.replace(/\*[A-Za-z0-9]{3,}.*$/, "");
  // Cut at the first long number (card / reference), a date, or a trailing city / province code.
  s = s.replace(/\s*[#*]?\d{4,}.*$/, "");
  s = s.replace(/\s+\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?.*$/, "");
  // A store number ("METRO PLUS 123 ...") ends the name.
  s = s.replace(/\s+#?\d{1,6}\b.*$/, "");
  s = s.replace(new RegExp(`\\s+(${PROVINCES})\\b.*$`, "i"), "");
  s = s.replace(/[\s*#-]+$/, "").replace(/^[\s*#-]+/, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (!s) return titleCase((description ?? "").trim().slice(0, 40));
  // Bank descriptions are usually upper-case: make them readable.
  return s === s.toUpperCase() || s === s.toLowerCase() ? titleCase(s) : s;
}

/** The stable key a categorization is remembered under (lower-case, no accents, no punctuation). */
export function supplierKey(name: string): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
