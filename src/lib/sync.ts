import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  SystemeIoClient,
  PROMOTED_FIELD_SLUGS,
  type SystemeIoContact,
} from "@/lib/systemeio";

export interface SyncResult {
  contactsSynced: number;
  tagsSynced: number;
}

export async function getSystemeIoClient(): Promise<SystemeIoClient | null> {
  const setting = await prisma.integrationSetting.findUnique({
    where: { provider: "systeme_io" },
  });
  if (!setting?.apiKeyEncrypted) return null;
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);
  return new SystemeIoClient(apiKey);
}

export async function runSystemeIoSync(): Promise<SyncResult> {
  const client = await getSystemeIoClient();
  if (!client) {
    throw new Error("systeme.io API key is not configured");
  }

  const log = await prisma.syncLog.create({
    data: { provider: "systeme_io", status: "running" },
  });

  let contactsSynced = 0;
  let tagsSynced = 0;

  try {
    // 1. Tags
    for await (const tags of client.iterateTags()) {
      for (const tag of tags) {
        await prisma.tag.upsert({
          where: { systemeIoId: tag.id },
          update: { name: tag.name },
          create: { systemeIoId: tag.id, name: tag.name },
        });
        tagsSynced += 1;
      }
    }

    // 2. Custom field definitions
    const definitions = await client.listCustomFieldDefinitions();
    for (const def of definitions) {
      if (!def.slug) continue;
      await prisma.customFieldDefinition.upsert({
        where: { slug: def.slug },
        update: { label: def.label, type: def.type },
        create: { slug: def.slug, label: def.label, type: def.type },
      });
    }

    // 3. Contacts (with tags + custom field values)
    for await (const contacts of client.iterateContacts()) {
      for (const contact of contacts) {
        await upsertContact(contact);
        contactsSynced += 1;
      }
    }

    await prisma.integrationSetting.update({
      where: { provider: "systeme_io" },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
      },
    });

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "success",
        finishedAt: new Date(),
        contactsSynced,
        tagsSynced,
      },
    });

    return { contactsSynced, tagsSynced };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await prisma.integrationSetting.update({
      where: { provider: "systeme_io" },
      data: { lastSyncStatus: "error", lastSyncError: message },
    });

    await prisma.syncLog.update({
      where: { id: log.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        contactsSynced,
        tagsSynced,
        errorMessage: message,
      },
    });

    throw error;
  }
}

async function upsertContact(contact: SystemeIoContact) {
  if (!contact.email) return;

  const promoted: Record<string, string> = {};
  const overflow: { slug: string; value: string }[] = [];

  for (const field of contact.fields) {
    if (!field.slug || field.value === null || field.value === undefined) continue;
    const value = String(field.value);
    const column = PROMOTED_FIELD_SLUGS[field.slug];
    if (column) {
      promoted[column] = value;
    } else {
      overflow.push({ slug: field.slug, value });
    }
  }

  const dbContact = await prisma.contact.upsert({
    where: { systemeIoId: contact.id },
    update: {
      email: contact.email,
      locale: contact.locale,
      systemeIoRegisteredAt: contact.registeredAt ? new Date(contact.registeredAt) : null,
      firstName: promoted.firstName,
      lastName: promoted.lastName,
      phone: promoted.phone,
      address: promoted.address,
      city: promoted.city,
      state: promoted.state,
      zip: promoted.zip,
      country: promoted.country,
      company: promoted.company,
      website: promoted.website,
      source: "systeme.io",
      lastSyncedAt: new Date(),
    },
    create: {
      systemeIoId: contact.id,
      email: contact.email,
      locale: contact.locale,
      systemeIoRegisteredAt: contact.registeredAt ? new Date(contact.registeredAt) : null,
      firstName: promoted.firstName,
      lastName: promoted.lastName,
      phone: promoted.phone,
      address: promoted.address,
      city: promoted.city,
      state: promoted.state,
      zip: promoted.zip,
      country: promoted.country,
      company: promoted.company,
      website: promoted.website,
      source: "systeme.io",
      lastSyncedAt: new Date(),
    },
  });

  // Overflow custom field values: full replace for this contact.
  for (const { slug, value } of overflow) {
    await prisma.contactFieldValue.upsert({
      where: { contactId_fieldSlug: { contactId: dbContact.id, fieldSlug: slug } },
      update: { value },
      create: { contactId: dbContact.id, fieldSlug: slug, value },
    });
  }

  // Tags: sync membership to match systeme.io exactly.
  // Sequential, not Promise.all — see src/lib/prisma.ts for why.
  const tagRecords = [];
  for (const tag of contact.tags) {
    tagRecords.push(
      await prisma.tag.upsert({
        where: { systemeIoId: tag.id },
        update: { name: tag.name },
        create: { systemeIoId: tag.id, name: tag.name },
      })
    );
  }

  await prisma.contactTag.deleteMany({
    where: {
      contactId: dbContact.id,
      tagId: { notIn: tagRecords.map((t) => t.id) },
    },
  });

  for (const tag of tagRecords) {
    await prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId: dbContact.id, tagId: tag.id } },
      update: {},
      create: { contactId: dbContact.id, tagId: tag.id },
    });
  }
}
