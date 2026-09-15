import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  SystemeIoClient,
  PROMOTED_FIELD_SLUGS,
  type SystemeIoContact,
  type SystemeIoSubscription,
  type SystemeIoEnrollment,
  type SystemeIoCommunityMembership,
  type SystemeIoEmailCampaign,
  type SystemeIoAutomationWorkflow,
} from "@/lib/systemeio";

export interface SyncResult {
  contactsSynced: number;
  tagsSynced: number;
  subscriptionsSynced: number;
  enrollmentsSynced: number;
  membershipsSynced: number;
  campaignsSynced: number;
  automationsSynced: number;
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
  let subscriptionsSynced = 0;
  let enrollmentsSynced = 0;
  let membershipsSynced = 0;
  let campaignsSynced = 0;
  let automationsSynced = 0;

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

    // 4. Subscriptions, course enrollments, community memberships. Each
    // block is wrapped separately so one failing resource type doesn't stop
    // the others.
    const contactIdBySystemeIoId = await buildContactIdLookup();

    // GET /payment/subscriptions requires a "contact" query param — there's
    // no global collection, so this runs once per known contact. A single
    // contact's request failing (e.g. it has none) doesn't stop the rest.
    for (const contactSystemeIoId of contactIdBySystemeIoId.keys()) {
      try {
        for await (const subscriptions of client.iterateSubscriptionsForContact(contactSystemeIoId)) {
          for (const sub of subscriptions) {
            await upsertSubscription(sub, contactIdBySystemeIoId);
            subscriptionsSynced += 1;
          }
        }
      } catch (error) {
        console.warn(`systeme.io subscriptions sync skipped for contact ${contactSystemeIoId}:`, error);
      }
    }

    try {
      for await (const enrollments of client.iterateEnrollments()) {
        for (const enrollment of enrollments) {
          await upsertEnrollment(enrollment, contactIdBySystemeIoId);
          enrollmentsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io course enrollments sync skipped:", error);
    }

    try {
      for await (const memberships of client.iterateCommunityMemberships()) {
        for (const membership of memberships) {
          await upsertCommunityMembership(membership, contactIdBySystemeIoId);
          membershipsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io community memberships sync skipped:", error);
    }

    // 5. Account-level marketing data (not tied to a contact): email
    // campaigns and automation workflows.
    try {
      for await (const campaigns of client.iterateEmailCampaigns()) {
        for (const campaign of campaigns) {
          await upsertEmailCampaign(campaign);
          campaignsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io email campaigns sync skipped:", error);
    }

    try {
      for await (const automations of client.iterateAutomationWorkflows()) {
        for (const automation of automations) {
          await upsertAutomationWorkflow(automation);
          automationsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io automation workflows sync skipped:", error);
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

    return {
      contactsSynced,
      tagsSynced,
      subscriptionsSynced,
      enrollmentsSynced,
      membershipsSynced,
      campaignsSynced,
      automationsSynced,
    };
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

async function buildContactIdLookup(): Promise<Map<number, string>> {
  const contacts = await prisma.contact.findMany({
    where: { systemeIoId: { not: null } },
    select: { id: true, systemeIoId: true },
  });
  return new Map(contacts.map((c) => [c.systemeIoId as number, c.id]));
}

async function upsertSubscription(sub: SystemeIoSubscription, contactIdBySystemeIoId: Map<number, string>) {
  const contactId = sub.contactSystemeIoId !== null ? (contactIdBySystemeIoId.get(sub.contactSystemeIoId) ?? null) : null;
  await prisma.subscription.upsert({
    where: { systemeIoId: sub.id },
    update: {
      contactId,
      status: sub.status,
      planName: sub.planName,
      amount: sub.amount,
      currency: sub.currency,
      startedAt: sub.startedAt ? new Date(sub.startedAt) : null,
      canceledAt: sub.canceledAt ? new Date(sub.canceledAt) : null,
      raw: sub.raw as never,
    },
    create: {
      systemeIoId: sub.id,
      contactId,
      status: sub.status,
      planName: sub.planName,
      amount: sub.amount,
      currency: sub.currency,
      startedAt: sub.startedAt ? new Date(sub.startedAt) : null,
      canceledAt: sub.canceledAt ? new Date(sub.canceledAt) : null,
      raw: sub.raw as never,
    },
  });
}

async function upsertEnrollment(enrollment: SystemeIoEnrollment, contactIdBySystemeIoId: Map<number, string>) {
  const contactId =
    enrollment.contactSystemeIoId !== null ? (contactIdBySystemeIoId.get(enrollment.contactSystemeIoId) ?? null) : null;
  await prisma.courseEnrollment.upsert({
    where: { systemeIoId: enrollment.id },
    update: {
      contactId,
      courseName: enrollment.courseName,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt ? new Date(enrollment.enrolledAt) : null,
      raw: enrollment.raw as never,
    },
    create: {
      systemeIoId: enrollment.id,
      contactId,
      courseName: enrollment.courseName,
      status: enrollment.status,
      enrolledAt: enrollment.enrolledAt ? new Date(enrollment.enrolledAt) : null,
      raw: enrollment.raw as never,
    },
  });
}

async function upsertCommunityMembership(
  membership: SystemeIoCommunityMembership,
  contactIdBySystemeIoId: Map<number, string>
) {
  const contactId =
    membership.contactSystemeIoId !== null ? (contactIdBySystemeIoId.get(membership.contactSystemeIoId) ?? null) : null;
  await prisma.communityMembership.upsert({
    where: { systemeIoId: membership.id },
    update: {
      contactId,
      communityName: membership.communityName,
      status: membership.status,
      joinedAt: membership.joinedAt ? new Date(membership.joinedAt) : null,
      raw: membership.raw as never,
    },
    create: {
      systemeIoId: membership.id,
      contactId,
      communityName: membership.communityName,
      status: membership.status,
      joinedAt: membership.joinedAt ? new Date(membership.joinedAt) : null,
      raw: membership.raw as never,
    },
  });
}

async function upsertEmailCampaign(campaign: SystemeIoEmailCampaign) {
  await prisma.emailCampaign.upsert({
    where: { systemeIoId: campaign.id },
    update: {
      name: campaign.name,
      subject: campaign.subject,
      status: campaign.status,
      sentAt: campaign.sentAt ? new Date(campaign.sentAt) : null,
      recipientCount: campaign.recipientCount,
      openCount: campaign.openCount,
      clickCount: campaign.clickCount,
      raw: campaign.raw as never,
    },
    create: {
      systemeIoId: campaign.id,
      name: campaign.name,
      subject: campaign.subject,
      status: campaign.status,
      sentAt: campaign.sentAt ? new Date(campaign.sentAt) : null,
      recipientCount: campaign.recipientCount,
      openCount: campaign.openCount,
      clickCount: campaign.clickCount,
      raw: campaign.raw as never,
    },
  });
}

async function upsertAutomationWorkflow(automation: SystemeIoAutomationWorkflow) {
  await prisma.automationWorkflow.upsert({
    where: { systemeIoId: automation.id },
    update: {
      name: automation.name,
      status: automation.status,
      triggerType: automation.triggerType,
      raw: automation.raw as never,
    },
    create: {
      systemeIoId: automation.id,
      name: automation.name,
      status: automation.status,
      triggerType: automation.triggerType,
      raw: automation.raw as never,
    },
  });
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
