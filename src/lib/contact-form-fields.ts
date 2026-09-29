// Pure FormData-parsing helpers shared by every Contact save path —
// updateContact's whole-form save (actions/contacts.ts) and each per-card
// section action (actions/contact-sections.ts). Deliberately NOT in either
// "use server" actions file: Next.js requires every export of a "use
// server" file to be an async function, and these are plain sync parsers
// with no side effects of their own — moving them here is what lets both
// action files import them without breaking that rule.
import { z } from "zod";
import type { PrismaClient } from "@/lib/prisma";
import { normalizeRegionForCountry } from "@/lib/regions";
import { CONTACT_SYNC_APPS, type ContactSyncDirection } from "@/lib/contact-sync";

// Google Contacts import (see google-contacts.ts) leaves email null for a
// phone-only personal contact, and Contact.email is nullable in the schema
// specifically to allow that — so this can't require a value the way it
// used to. Empty string is normalized to undefined before the .email()
// check runs, so a blank field passes and a genuinely malformed address
// still doesn't.
export const ContactSchema = z.object({
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().toLowerCase().email("A valid email is required").optional()
  ),
  email2: z.string().trim().optional(),
  extraEmails: z.array(z.string().trim()).optional(),
  firstName: z.string().trim().optional(),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  phone2: z.string().trim().optional(),
  extraPhones: z.array(z.string().trim()).optional(),
  company: z.string().trim().optional(),
  nickname: z.string().trim().optional(),
  jobTitle: z.string().trim().optional(),
  birthday: z.string().trim().optional(),
  // Nullable (not just optional): the avatar picker submits an explicit ""
  // for "Remove photo", which needs to actually clear the column rather
  // than leave it untouched the way an omitted/undefined field would.
  avatarUrl: z.string().trim().nullable().optional(),
  companyType: z.string().trim().optional(),
  jurisdictionCountry: z.string().trim().optional(),
  jurisdictionRegion: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  locale: z.string().trim().optional(),
  timeZone: z.string().trim().optional(),
  website: z.string().trim().optional(),
  // Only ever actually submitted when the contact isn't systeme.io-synced
  // (see contact-form.tsx) — for a synced contact the field isn't rendered,
  // so this resolves to undefined and Prisma's update leaves it untouched.
  source: z.string().trim().optional(),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip: z.string().trim().optional(),
  country: z.string().trim().optional(),
  billingAddress: z.string().trim().optional(),
  billingCity: z.string().trim().optional(),
  billingState: z.string().trim().optional(),
  billingZip: z.string().trim().optional(),
  billingCountry: z.string().trim().optional(),
  billingContactName: z.string().trim().optional(),
  billingEmail: z.string().trim().optional(),
  billingPhone: z.string().trim().optional(),
  websiteDomain: z.string().trim().optional(),
  websiteHostingProvider: z.string().trim().optional(),
  websiteDesignApp: z.string().trim().optional(),
  funnelsDomain: z.string().trim().optional(),
  funnelsHostingProvider: z.string().trim().optional(),
  funnelsDesignApp: z.string().trim().optional(),
  emailDomain: z.string().trim().optional(),
  emailHostingProvider: z.string().trim().optional(),
  emailMarketingApp: z.string().trim().optional(),
  storeDomain: z.string().trim().optional(),
  storeHostingProvider: z.string().trim().optional(),
  storeDesignApp: z.string().trim().optional(),
  autoSendInvoiceReminders: z.boolean(),
  preferredCurrency: z.string().trim().optional(),
  paymentTerms: z.string().trim().optional(),
  paymentSchedule: z.string().trim().optional(),
  defaultDiscount: z.number().optional(),
  stage: z.enum(["LEAD", "PROSPECT", "CLIENT", "PAST_CLIENT", "UNSUBSCRIBED", "PERSONAL"]),
  notes: z.string().trim().optional(),
});

const CONTACT_FORM_FIELDS = [
  "email2",
  "firstName",
  "lastName",
  "phone",
  "phone2",
  "company",
  "nickname",
  "jobTitle",
  "birthday",
  "companyType",
  "jurisdictionCountry",
  "jurisdictionRegion",
  "industry",
  "locale",
  "timeZone",
  "website",
  "source",
  "preferredCurrency",
  "paymentTerms",
  "paymentSchedule",
  "address",
  "city",
  "state",
  "zip",
  "country",
  "billingAddress",
  "billingCity",
  "billingState",
  "billingZip",
  "billingCountry",
  "billingContactName",
  "billingEmail",
  "billingPhone",
  "websiteDomain",
  "websiteHostingProvider",
  "websiteDesignApp",
  "funnelsDomain",
  "funnelsHostingProvider",
  "funnelsDesignApp",
  "emailDomain",
  "emailHostingProvider",
  "emailMarketingApp",
  "storeDomain",
  "storeHostingProvider",
  "storeDesignApp",
  "notes",
] as const;

// Parallel "socialPlatform"/"socialUrl" inputs (same index = same row),
// submitted alongside the rest of the Contact form — rows with no URL are
// dropped since the platform alone isn't a usable link.
export function readSocialLinks(formData: FormData): { platform: string; url: string }[] {
  const platforms = formData.getAll("socialPlatform").map(String);
  const urls = formData.getAll("socialUrl").map(String);
  const links: { platform: string; url: string }[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i].trim();
    if (!url) continue;
    links.push({ platform: (platforms[i] ?? "Other").trim() || "Other", url });
  }
  return links;
}

// Parallel "extraAddress{Address,City,State,Zip,Country}" inputs (same
// index = same row) — additional addresses beyond the main one, added via
// the Contact form's "+" button. A row is kept if any field beyond country
// (the select always has some value) is filled in.
export function readExtraAddresses(formData: FormData) {
  const descriptions = formData.getAll("extraAddressDescription").map(String);
  const addresses = formData.getAll("extraAddressAddress").map(String);
  const cities = formData.getAll("extraAddressCity").map(String);
  const states = formData.getAll("extraAddressState").map(String);
  const zips = formData.getAll("extraAddressZip").map(String);
  const countries = formData.getAll("extraAddressCountry").map(String);
  const rows: { description: string | null; address: string; city: string; state: string; zip: string; country: string; order: number }[] = [];
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i]?.trim() ?? "";
    const city = cities[i]?.trim() ?? "";
    const zip = zips[i]?.trim() ?? "";
    if (!address && !city && !zip) continue;
    const country = countries[i]?.trim() ?? "";
    rows.push({
      description: descriptions[i]?.trim() || null,
      address,
      city,
      state: normalizeRegionForCountry(country, states[i]?.trim()) ?? "",
      zip,
      country,
      order: rows.length,
    });
  }
  return rows;
}

// Parallel "messagingApp"/"messagingHandle" inputs (same index = same row)
// — Telegram/Discord/etc, beyond WhatsApp's own dedicated phone field.
export function readMessagingAccounts(formData: FormData) {
  const apps = formData.getAll("messagingApp").map(String);
  const handles = formData.getAll("messagingHandle").map(String);
  const rows: { app: string; handle: string; order: number }[] = [];
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]?.trim() ?? "";
    if (!handle) continue;
    rows.push({ app: (apps[i] ?? "Other").trim() || "Other", handle, order: rows.length });
  }
  return rows;
}

// Parallel "voipApp"/"voipHandle" inputs (same index = same row) — preferred
// video/voice calling apps, a separate list from the instant-messaging one
// above.
export function readVoipAccounts(formData: FormData) {
  const apps = formData.getAll("voipApp").map(String);
  const handles = formData.getAll("voipHandle").map(String);
  const rows: { app: string; handle: string; order: number }[] = [];
  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]?.trim() ?? "";
    if (!handle) continue;
    rows.push({ app: (apps[i] ?? "Other").trim() || "Other", handle, order: rows.length });
  }
  return rows;
}

// Reads one editable "known" systeme.io custom field — the value input and
// a hidden input carrying the exact fieldSlug to write it under (resolved
// client-side in contact-form.tsx: an existing ContactFieldValue row's own
// slug when there is one, otherwise the field's default slug). Returns null
// if the slug is missing (shouldn't happen — the hidden input always
// renders — but guards against a malformed submission touching an
// unintended field).
function readCustomFieldEdit(formData: FormData, valueField: string, slugField: string): { slug: string; value: string } | null {
  const slug = String(formData.get(slugField) ?? "").trim();
  if (!slug) return null;
  return { slug, value: String(formData.get(valueField) ?? "").trim() };
}

// Returns the write(s) as unresolved Prisma operations instead of awaiting
// them here, so the caller can fold them into one batched $transaction
// alongside every other child-row replace (see the comment on that
// transaction in updateContact for why).
export function buildCustomFieldEditOps(db: PrismaClient, contactId: string, formData: FormData) {
  const edits = [
    readCustomFieldEdit(formData, "servicesRequired", "servicesRequiredSlug"),
    readCustomFieldEdit(formData, "projectGoalDescription", "projectGoalDescriptionSlug"),
  ].filter((edit): edit is { slug: string; value: string } => edit !== null);

  return edits.map((edit) =>
    edit.value
      ? db.contactFieldValue.upsert({
          where: { contactId_fieldSlug: { contactId, fieldSlug: edit.slug } },
          update: { value: edit.value },
          create: { contactId, fieldSlug: edit.slug, value: edit.value },
        })
      : db.contactFieldValue.deleteMany({ where: { contactId, fieldSlug: edit.slug } })
  );
}

// Parallel "techStack{Label,Domain,HostingProvider,App}" inputs (same
// index = same row) — extra Tech Stack lines beyond the fixed Website/
// Funnels/Email/Store ones, with a free-text label instead of a fixed name.
export function readTechStackItems(formData: FormData) {
  const labels = formData.getAll("techStackLabel").map(String);
  const domains = formData.getAll("techStackDomain").map(String);
  const hostingProviders = formData.getAll("techStackHostingProvider").map(String);
  const apps = formData.getAll("techStackApp").map(String);
  const rows: { label: string; domain: string; hostingProvider: string; app: string; order: number }[] = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]?.trim() ?? "";
    if (!label) continue;
    rows.push({
      label,
      domain: domains[i]?.trim() ?? "",
      hostingProvider: hostingProviders[i]?.trim() ?? "",
      app: apps[i]?.trim() ?? "",
      order: rows.length,
    });
  }
  return rows;
}

// Parallel "domain{Domain,Registrar,DnsProvider,ExpiryDate,AutoRenew,
// ManagedBy,Notes}" inputs (same index = same row) — client domains this
// contact owns, added via the Contact form's "+" button. autoRenew is
// submitted as a <select> "on"/"off" rather than a checkbox specifically so
// it always appears in getAll() at the right index (an unchecked checkbox
// submits nothing at all, which would desync every array's indexes).
export function readDomainItems(formData: FormData) {
  const domains = formData.getAll("domainDomain").map(String);
  const registrars = formData.getAll("domainRegistrar").map(String);
  const dnsProviders = formData.getAll("domainDnsProvider").map(String);
  const expiryDates = formData.getAll("domainExpiryDate").map(String);
  const autoRenews = formData.getAll("domainAutoRenew").map(String);
  const managedBys = formData.getAll("domainManagedBy").map(String);
  const notesList = formData.getAll("domainNotes").map(String);
  const rows: {
    domain: string;
    registrar: string | null;
    dnsProvider: string | null;
    expiryDate: Date | null;
    autoRenew: boolean;
    managedBy: string | null;
    notes: string | null;
    order: number;
  }[] = [];
  for (let i = 0; i < domains.length; i++) {
    const domain = domains[i]?.trim() ?? "";
    if (!domain) continue;
    const expiry = expiryDates[i]?.trim();
    rows.push({
      domain,
      registrar: registrars[i]?.trim() || null,
      dnsProvider: dnsProviders[i]?.trim() || null,
      expiryDate: expiry ? new Date(expiry) : null,
      autoRenew: autoRenews[i] === "on",
      managedBy: managedBys[i]?.trim() || null,
      notes: notesList[i]?.trim() || null,
      order: rows.length,
    });
  }
  return rows;
}

// Parallel "relationContactId"/"relationType"/"relationNotes" inputs (same
// index = same row) — links to other CRM contacts (family or business
// relations), added via the Contact form's "+" button. A row with no
// selected contact is dropped.
export function readContactRelations(formData: FormData) {
  const relatedIds = formData.getAll("relationContactId").map(String);
  const types = formData.getAll("relationType").map(String);
  const notesList = formData.getAll("relationNotes").map(String);
  const rows: { relatedContactId: string; relationType: string; notes: string | null }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < relatedIds.length; i++) {
    const relatedContactId = relatedIds[i]?.trim() ?? "";
    if (!relatedContactId || seen.has(relatedContactId)) continue;
    seen.add(relatedContactId);
    rows.push({
      relatedContactId,
      relationType: types[i]?.trim() || "Other",
      notes: notesList[i]?.trim() || null,
    });
  }
  return rows;
}

// Suggestions for the Related Contacts "Relation" field, grouped by the
// "Type of relationship" selector shown beside it — still free text (a
// <datalist>, not an enum) since real relationships always outrun any
// fixed list.
export const FAMILY_RELATION_OPTIONS = [
  "Wife",
  "Husband",
  "Partner",
  "Mother",
  "Father",
  "Parent",
  "Sister",
  "Brother",
  "Sibling",
  "Daughter",
  "Son",
  "Child",
  "Grandmother",
  "Grandfather",
  "Grandparent",
  "Grandchild",
  "Cousin",
  "Sister-in-law",
  "Brother-in-law",
  "Friend",
];
export const PROFESSIONAL_RELATION_OPTIONS = [
  "Employee",
  "Employer",
  "Manager",
  "President",
  "Vice-President",
  "Business partner",
  "Colleague",
  "Lawyer",
  "Accountant",
  "Financial Advisor",
  "Consultant",
  "Contractor",
  "Client",
  "Supplier",
];

// The mirrored relation created/updated on the OTHER contact whenever a
// relation is saved (see updateContactRelations) — so "Wife" on this
// contact's page automatically shows up as "Husband" on the other
// contact's own page, each reading correctly from that contact's own
// perspective, instead of the same one-sided label appearing on both.
// Best-effort: reciprocals that actually depend on the other person's
// gender (Mother/Father, Son/Daughter, the in-laws, ...) fall back to a
// neutral term (Child, Parent, Sibling-in-law...) rather than guessing
// wrong — the saved contact can always correct it afterward. Anything not
// listed here (including custom free text) mirrors back as itself.
const RELATION_RECIPROCALS: Record<string, string> = {
  Wife: "Husband",
  Husband: "Wife",
  Partner: "Partner",
  Mother: "Child",
  Father: "Child",
  Parent: "Child",
  Child: "Parent",
  Son: "Parent",
  Daughter: "Parent",
  Sister: "Sibling",
  Brother: "Sibling",
  Sibling: "Sibling",
  Grandmother: "Grandchild",
  Grandfather: "Grandchild",
  Grandparent: "Grandchild",
  Grandchild: "Grandparent",
  Cousin: "Cousin",
  "Sister-in-law": "Brother-in-law",
  "Brother-in-law": "Sister-in-law",
  Friend: "Friend",
  Employee: "Employer",
  Employer: "Employee",
  Manager: "Employee",
  President: "Employee",
  "Vice-President": "Employee",
  "Business partner": "Business partner",
  Colleague: "Colleague",
  Lawyer: "Client",
  Accountant: "Client",
  "Financial Advisor": "Client",
  Consultant: "Client",
  Contractor: "Client",
  Client: "Supplier",
  Supplier: "Client",
};

export function reciprocalRelationType(relationType: string): string {
  return RELATION_RECIPROCALS[relationType] ?? relationType;
}

// Parallel "noteText" inputs (one per note row) — a blank row is dropped,
// same as every other repeatable-row reader above.
export function readContactNotes(formData: FormData) {
  return formData
    .getAll("noteText")
    .map(String)
    .map((text) => text.trim())
    .filter((text) => text.length > 0);
}

// One enabled checkbox + one direction <select> per entry in
// CONTACT_SYNC_APPS (see src/lib/contact-sync.ts) — always submitted for
// every known app regardless of whether this contact has ever synced with
// it yet, so a brand-new app-sync row can be created on first save.
export function readAppSyncSettings(formData: FormData) {
  return CONTACT_SYNC_APPS.map((def) => ({
    app: def.app,
    enabled: formData.get(`appSyncEnabled_${def.app}`) === "on",
    direction: String(formData.get(`appSyncDirection_${def.app}`) ?? "BOTH") as ContactSyncDirection,
  }));
}

export function readContactForm(formData: FormData) {
  const raw: Record<string, string | string[] | boolean | number | undefined> = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    stage: String(formData.get("stage") ?? "LEAD"),
    extraEmails: formData.getAll("extraEmails").map(String).map((v) => v.trim()).filter(Boolean),
    extraPhones: formData.getAll("extraPhones").map(String).map((v) => v.trim()).filter(Boolean),
    autoSendInvoiceReminders: formData.get("autoSendInvoiceReminders") === "on",
  };
  for (const field of CONTACT_FORM_FIELDS) {
    raw[field] = String(formData.get(field) ?? "").trim() || undefined;
  }
  const discountRaw = String(formData.get("defaultDiscount") ?? "").trim();
  raw.defaultDiscount = discountRaw ? Number(discountRaw) : undefined;
  if (Number.isNaN(raw.defaultDiscount)) raw.defaultDiscount = undefined;
  // Belt-and-suspenders: the edit form's region dropdown already submits a
  // canonical code when the country has one, but this keeps state/province
  // correct for any older data or a direct API call too.
  raw.state = normalizeRegionForCountry(raw.country as string | undefined, raw.state as string | undefined) || undefined;
  raw.billingState = normalizeRegionForCountry(raw.billingCountry as string | undefined, raw.billingState as string | undefined) || undefined;
  raw.jurisdictionRegion =
    normalizeRegionForCountry(raw.jurisdictionCountry as string | undefined, raw.jurisdictionRegion as string | undefined) || undefined;
  const parsed = ContactSchema.parse(raw);
  // Prisma treats an `undefined` property as "leave unchanged", not "clear
  // it" — explicit null is what actually empties the column back out if a
  // previously-set email is removed on the form.
  return { ...parsed, email: parsed.email ?? null };
}
