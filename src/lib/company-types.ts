// Common company legal-structure names across English- and French-speaking
// countries — offered as <datalist> suggestions on the Contact form rather
// than a rigid enum, since legal status naming varies too much by country
// to enumerate exhaustively. Free text is always accepted; anything not
// listed here can still be typed in directly.
export const COMPANY_TYPES = [
  // Canada
  "Sole proprietorship",
  "General partnership",
  "Limited partnership",
  "Corporation (Inc.)",
  "Cooperative",
  "Non-profit organization",
  // United States
  "LLC",
  "S Corporation",
  "C Corporation",
  "Partnership",
  "Nonprofit corporation",
  // United Kingdom / Commonwealth
  "Sole trader",
  "Private limited company (Ltd.)",
  "Public limited company (PLC)",
  "Limited liability partnership (LLP)",
  // France
  "Auto-entrepreneur / Micro-entreprise",
  "EURL",
  "SARL",
  "SAS",
  "SASU",
  "SA",
  // Other / generic
  "Freelancer / Self-employed",
  "Association",
  "Other",
];
