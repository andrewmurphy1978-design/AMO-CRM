"use server";

// One server action per Contact Info card, so each can be edited from its
// own dialog (see [id]/*-dialog.tsx) instead of the old full-page Edit
// form. Each action here touches only the columns/child rows that belong
// to its one card — never the full-replace-everything shape updateContact
// uses for its whole-form save, since a per-card FormData only ever
// contains that card's own fields (see the comment on ContactSchema.pick
// below for why reusing updateContact's own readContactForm would silently
// wipe every other card's data).
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getDict } from "@/lib/i18n/dictionaries";
import { normalizeRegionForCountry } from "@/lib/regions";
import { CONTACT_SYNC_APPS, type ContactSyncDirection } from "@/lib/contact-sync";
import {
  ContactSchema,
  readSocialLinks,
  readExtraAddresses,
  readMessagingAccounts,
  readVoipAccounts,
  readTechStackItems,
  readDomainItems,
  readContactRelations,
  readAppSyncSettings,
  buildCustomFieldEditOps,
} from "@/lib/contact-form-fields";
import { applyContactExternalSyncs } from "./contacts";

type ActionResult = { error?: string; success?: string };

function trimmed(formData: FormData, field: string): string | undefined {
  return String(formData.get(field) ?? "").trim() || undefined;
}

// Every other section action's save needs the contact's *current* app-sync
// settings (to decide whether this save should still push to systeme.io/
// Google) without touching them — only the Other Info dialog actually edits
// app-sync, via readAppSyncSettings below. A contact with no ContactAppSync
// row yet for a given app (never explicitly configured) defaults exactly
// like readAppSyncSettings' own FormData fallback: enabled off, BOTH.
async function currentAppSyncRows(
  db: PrismaClient,
  contactId: string
): Promise<{ app: string; enabled: boolean; direction: ContactSyncDirection }[]> {
  const rows = await db.contactAppSync.findMany({ where: { contactId } });
  return CONTACT_SYNC_APPS.map((def) => {
    const row = rows.find((r) => r.app === def.app);
    return { app: def.app, enabled: row?.enabled ?? false, direction: (row?.direction as ContactSyncDirection | undefined) ?? "BOTH" };
  });
}

async function auth2() {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  return session;
}

export async function updateContactGeneralInfo(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const Schema = ContactSchema.pick({
    firstName: true,
    lastName: true,
    company: true,
    nickname: true,
    jobTitle: true,
    birthday: true,
    companyType: true,
    jurisdictionCountry: true,
    jurisdictionRegion: true,
    industry: true,
    locale: true,
    timeZone: true,
    website: true,
    stage: true,
    source: true,
  });
  const raw = {
    firstName: trimmed(formData, "firstName"),
    lastName: trimmed(formData, "lastName"),
    company: trimmed(formData, "company"),
    nickname: trimmed(formData, "nickname"),
    jobTitle: trimmed(formData, "jobTitle"),
    birthday: trimmed(formData, "birthday"),
    companyType: trimmed(formData, "companyType"),
    jurisdictionCountry: trimmed(formData, "jurisdictionCountry"),
    jurisdictionRegion: normalizeRegionForCountry(trimmed(formData, "jurisdictionCountry"), trimmed(formData, "jurisdictionRegion")) || undefined,
    industry: trimmed(formData, "industry"),
    locale: trimmed(formData, "locale"),
    timeZone: trimmed(formData, "timeZone"),
    website: trimmed(formData, "website"),
    stage: String(formData.get("stage") ?? "LEAD"),
    source: trimmed(formData, "source"),
  };

  let data;
  try {
    data = Schema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const result = await withScopedPrismaClient(async (db) => {
    const updated = await db.contact.update({ where: { id: contactId }, data });
    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactInfo(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const Schema = ContactSchema.pick({ email: true, email2: true, extraEmails: true, phone: true, phone2: true, extraPhones: true });
  const raw = {
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    email2: trimmed(formData, "email2"),
    extraEmails: formData.getAll("extraEmails").map(String).map((v) => v.trim()).filter(Boolean),
    phone: trimmed(formData, "phone"),
    phone2: trimmed(formData, "phone2"),
    extraPhones: formData.getAll("extraPhones").map(String).map((v) => v.trim()).filter(Boolean),
  };

  let parsed;
  try {
    parsed = Schema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }
  const data = { ...parsed, email: parsed.email ?? null };

  const result = await withScopedPrismaClient(async (db) => {
    if (data.email) {
      const existing = await db.contact.findFirst({ where: { email: data.email, NOT: { id: contactId } } });
      if (existing) return { error: t.actions.contactEmailExistsOther };
    }

    const updated = await db.contact.update({ where: { id: contactId }, data });

    const messagingAccounts = readMessagingAccounts(formData);
    await db.$transaction([
      db.contactMessagingAccount.deleteMany({ where: { contactId } }),
      ...(messagingAccounts.length > 0
        ? [db.contactMessagingAccount.createMany({ data: messagingAccounts.map((row) => ({ ...row, contactId })) })]
        : []),
    ]);

    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  if ("error" in result) return { error: result.error };
  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactSocial(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const result = await withScopedPrismaClient(async (db) => {
    const socialLinks = readSocialLinks(formData);
    await db.$transaction([
      db.contactSocialLink.deleteMany({ where: { contactId } }),
      ...(socialLinks.length > 0 ? [db.contactSocialLink.createMany({ data: socialLinks.map((link) => ({ ...link, contactId })) })] : []),
    ]);
    const updated = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactVoip(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const result = await withScopedPrismaClient(async (db) => {
    const voipAccounts = readVoipAccounts(formData);
    await db.$transaction([
      db.contactVoipAccount.deleteMany({ where: { contactId } }),
      ...(voipAccounts.length > 0 ? [db.contactVoipAccount.createMany({ data: voipAccounts.map((row) => ({ ...row, contactId })) })] : []),
    ]);
    const updated = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactAddresses(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const Schema = ContactSchema.pick({
    address: true,
    city: true,
    state: true,
    zip: true,
    country: true,
    billingAddress: true,
    billingCity: true,
    billingState: true,
    billingZip: true,
    billingCountry: true,
    billingContactName: true,
    billingEmail: true,
    billingPhone: true,
  });
  const country = trimmed(formData, "country");
  const billingCountry = trimmed(formData, "billingCountry");
  const raw = {
    address: trimmed(formData, "address"),
    city: trimmed(formData, "city"),
    state: normalizeRegionForCountry(country, trimmed(formData, "state")) || undefined,
    zip: trimmed(formData, "zip"),
    country,
    billingAddress: trimmed(formData, "billingAddress"),
    billingCity: trimmed(formData, "billingCity"),
    billingState: normalizeRegionForCountry(billingCountry, trimmed(formData, "billingState")) || undefined,
    billingZip: trimmed(formData, "billingZip"),
    billingCountry,
    billingContactName: trimmed(formData, "billingContactName"),
    billingEmail: trimmed(formData, "billingEmail"),
    billingPhone: trimmed(formData, "billingPhone"),
  };

  let data;
  try {
    data = Schema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const result = await withScopedPrismaClient(async (db) => {
    const updated = await db.contact.update({ where: { id: contactId }, data });

    const extraAddresses = readExtraAddresses(formData);
    await db.$transaction([
      db.contactAddress.deleteMany({ where: { contactId } }),
      ...(extraAddresses.length > 0 ? [db.contactAddress.createMany({ data: extraAddresses.map((addr) => ({ ...addr, contactId })) })] : []),
    ]);

    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactInvoice(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const Schema = ContactSchema.pick({
    autoSendInvoiceReminders: true,
    preferredCurrency: true,
    paymentTerms: true,
    paymentSchedule: true,
    defaultDiscount: true,
  });
  const discountRaw = trimmed(formData, "defaultDiscount");
  let defaultDiscount = discountRaw ? Number(discountRaw) : undefined;
  if (Number.isNaN(defaultDiscount)) defaultDiscount = undefined;
  const raw = {
    autoSendInvoiceReminders: formData.get("autoSendInvoiceReminders") === "on",
    preferredCurrency: trimmed(formData, "preferredCurrency"),
    paymentTerms: trimmed(formData, "paymentTerms"),
    paymentSchedule: trimmed(formData, "paymentSchedule"),
    defaultDiscount,
  };

  let data;
  try {
    data = Schema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const result = await withScopedPrismaClient(async (db) => {
    const updated = await db.contact.update({ where: { id: contactId }, data });
    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactTechStack(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const Schema = ContactSchema.pick({
    websiteDomain: true,
    websiteHostingProvider: true,
    websiteDesignApp: true,
    funnelsDomain: true,
    funnelsHostingProvider: true,
    funnelsDesignApp: true,
    emailDomain: true,
    emailHostingProvider: true,
    emailMarketingApp: true,
    storeDomain: true,
    storeHostingProvider: true,
    storeDesignApp: true,
  });
  const raw = {
    websiteDomain: trimmed(formData, "websiteDomain"),
    websiteHostingProvider: trimmed(formData, "websiteHostingProvider"),
    websiteDesignApp: trimmed(formData, "websiteDesignApp"),
    funnelsDomain: trimmed(formData, "funnelsDomain"),
    funnelsHostingProvider: trimmed(formData, "funnelsHostingProvider"),
    funnelsDesignApp: trimmed(formData, "funnelsDesignApp"),
    emailDomain: trimmed(formData, "emailDomain"),
    emailHostingProvider: trimmed(formData, "emailHostingProvider"),
    emailMarketingApp: trimmed(formData, "emailMarketingApp"),
    storeDomain: trimmed(formData, "storeDomain"),
    storeHostingProvider: trimmed(formData, "storeHostingProvider"),
    storeDesignApp: trimmed(formData, "storeDesignApp"),
  };

  let data;
  try {
    data = Schema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const result = await withScopedPrismaClient(async (db) => {
    const updated = await db.contact.update({ where: { id: contactId }, data });

    const techStackItems = readTechStackItems(formData);
    await db.$transaction([
      db.contactTechStackItem.deleteMany({ where: { contactId } }),
      ...(techStackItems.length > 0 ? [db.contactTechStackItem.createMany({ data: techStackItems.map((row) => ({ ...row, contactId })) })] : []),
    ]);

    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactDomains(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const result = await withScopedPrismaClient(async (db) => {
    const domains = readDomainItems(formData);
    await db.$transaction([
      db.contactDomain.deleteMany({ where: { contactId } }),
      ...(domains.length > 0 ? [db.contactDomain.createMany({ data: domains.map((row) => ({ ...row, contactId })) })] : []),
    ]);
    const updated = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactRelations(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const result = await withScopedPrismaClient(async (db) => {
    const relations = readContactRelations(formData);
    await db.$transaction([
      db.contactRelation.deleteMany({ where: { contactId } }),
      ...(relations.length > 0 ? [db.contactRelation.createMany({ data: relations.map((row) => ({ ...row, contactId })) })] : []),
    ]);
    const updated = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
    const appSyncRows = await currentAppSyncRows(db, contactId);
    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function updateContactOtherInfo(
  contactId: string,
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth2();
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const Schema = ContactSchema.pick({ source: true });
  const raw = { source: trimmed(formData, "source") };
  let data;
  try {
    data = Schema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    throw error;
  }

  const result = await withScopedPrismaClient(async (db) => {
    const updated = await db.contact.update({ where: { id: contactId }, data });

    const appSyncRows = readAppSyncSettings(formData);
    await db.$transaction([
      ...appSyncRows.map((row) =>
        db.contactAppSync.upsert({
          where: { contactId_app: { contactId, app: row.app } },
          update: { enabled: row.enabled, direction: row.direction },
          create: { contactId, app: row.app, enabled: row.enabled, direction: row.direction },
        })
      ),
      ...buildCustomFieldEditOps(db, contactId, formData),
    ]);

    const syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);
    return { syncStatus };
  });

  revalidatePaths(contactId);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

function revalidatePaths(contactId: string) {
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
}
