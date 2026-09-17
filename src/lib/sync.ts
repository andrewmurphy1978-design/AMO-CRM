import { prisma, withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
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
  type SystemeIoBooking,
} from "@/lib/systemeio";

export interface SyncResult {
  contactsSynced: number;
  tagsSynced: number;
  subscriptionsSynced: number;
  enrollmentsSynced: number;
  membershipsSynced: number;
  campaignsSynced: number;
  automationsSynced: number;
  bookingsSynced: number;
}

// Used outside the bulk sync (e.g. pushing a single contact edit back to
// systeme.io). Pass a `db` from a caller's own withScopedPrismaClient block
// when this is one of several Prisma calls in the same request (e.g.
// contacts.ts's tag/update actions) — falls back to the regular
// auto-reconnecting `prisma` proxy for genuinely one-off callers (cron
// jobs) that have no scoped client of their own.
export async function getSystemeIoClient(db: PrismaClient = prisma): Promise<SystemeIoClient | null> {
  const setting = await db.integrationSetting.findUnique({
    where: { provider: "systeme_io" },
  });
  if (!setting?.apiKeyEncrypted) return null;
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);
  return new SystemeIoClient(apiKey);
}

// The sync can easily make 100+ database calls for a modest contact list
// (each contact's own upsert, plus its field values and tag links). Under
// Cloudflare Workers, the regular `prisma` proxy builds a brand-new pooled
// connection on every single one of those — fine for a normal page's
// handful of queries, but that many fresh connections within one Worker
// invocation is CPU-heavy enough to trip Cloudflare's "Error 1102" resource
// limit on its own, regardless of how the systeme.io API calls are paced.
// `withScopedPrismaClient` builds exactly one client for this whole
// operation instead — see its comment in src/lib/prisma.ts for why that's
// safe here specifically.
export async function runSystemeIoSync(): Promise<SyncResult> {
  return withScopedPrismaClient((db) => runSystemeIoSyncWith(db));
}

async function runSystemeIoSyncWith(db: PrismaClient): Promise<SyncResult> {
  const setting = await db.integrationSetting.findUnique({ where: { provider: "systeme_io" } });
  if (!setting?.apiKeyEncrypted) {
    throw new Error("systeme.io API key is not configured");
  }
  const apiKey = await decryptSecret(setting.apiKeyEncrypted);
  const client = new SystemeIoClient(apiKey);

  const log = await db.syncLog.create({
    data: { provider: "systeme_io", status: "running" },
  });

  let contactsSynced = 0;
  let tagsSynced = 0;
  let subscriptionsSynced = 0;
  let enrollmentsSynced = 0;
  let membershipsSynced = 0;
  let campaignsSynced = 0;
  let automationsSynced = 0;
  let bookingsSynced = 0;

  try {
    // 1. Tags
    for await (const tags of client.iterateTags()) {
      for (const tag of tags) {
        await db.tag.upsert({
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
      await db.customFieldDefinition.upsert({
        where: { slug: def.slug },
        update: { label: def.label, type: def.type },
        create: { slug: def.slug, label: def.label, type: def.type },
      });
    }

    // 3. Contacts (with tags + custom field values)
    for await (const contacts of client.iterateContacts()) {
      for (const contact of contacts) {
        await upsertContact(db, contact);
        contactsSynced += 1;
      }
    }

    // 4. Subscriptions, course enrollments, community memberships. Each
    // block is wrapped separately so one failing resource type doesn't stop
    // the others.
    const contactIdBySystemeIoId = await buildContactIdLookup(db);

    // GET /payment/subscriptions requires a "contact" query param — there's
    // no global collection, so this runs once per known contact. The
    // network fetches run a handful at a time (systeme.io calls, not DB
    // calls) so N contacts isn't N fully sequential round-trips; the
    // resulting upserts stay sequential against the one scoped db client.
    const contactIds = [...contactIdBySystemeIoId.keys()];
    const SUBSCRIPTION_FETCH_CONCURRENCY = 5;
    for (let i = 0; i < contactIds.length; i += SUBSCRIPTION_FETCH_CONCURRENCY) {
      const batch = contactIds.slice(i, i + SUBSCRIPTION_FETCH_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (contactSystemeIoId) => {
          const subs: SystemeIoSubscription[] = [];
          try {
            for await (const subscriptions of client.iterateSubscriptionsForContact(contactSystemeIoId)) {
              subs.push(...subscriptions);
            }
          } catch (error) {
            console.warn(`systeme.io subscriptions sync skipped for contact ${contactSystemeIoId}:`, error);
          }
          return subs;
        })
      );
      for (const subs of results) {
        for (const sub of subs) {
          await upsertSubscription(db, sub, contactIdBySystemeIoId);
          subscriptionsSynced += 1;
        }
      }
    }

    try {
      for await (const enrollments of client.iterateEnrollments()) {
        for (const enrollment of enrollments) {
          await upsertEnrollment(db, enrollment, contactIdBySystemeIoId);
          enrollmentsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io course enrollments sync skipped:", error);
    }

    try {
      for await (const memberships of client.iterateCommunityMemberships()) {
        for (const membership of memberships) {
          await upsertCommunityMembership(db, membership, contactIdBySystemeIoId);
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
          await upsertEmailCampaign(db, campaign);
          campaignsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io email campaigns sync skipped:", error);
    }

    try {
      for await (const automations of client.iterateAutomationWorkflows()) {
        for (const automation of automations) {
          await upsertAutomationWorkflow(db, automation);
          automationsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io automation workflows sync skipped:", error);
    }

    try {
      const contactNameIndex = await buildContactNameIndex(db);
      for await (const bookings of client.iterateBookings()) {
        for (const booking of bookings) {
          await upsertBooking(db, booking, contactNameIndex);
          bookingsSynced += 1;
        }
      }
    } catch (error) {
      console.warn("systeme.io bookings sync skipped:", error);
    }

    await db.integrationSetting.update({
      where: { provider: "systeme_io" },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: "success",
        lastSyncError: null,
      },
    });

    await db.syncLog.update({
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
      bookingsSynced,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await db.integrationSetting.update({
      where: { provider: "systeme_io" },
      data: { lastSyncStatus: "error", lastSyncError: message },
    });

    await db.syncLog.update({
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

async function buildContactIdLookup(db: PrismaClient): Promise<Map<number, string>> {
  const contacts = await db.contact.findMany({
    where: { systemeIoId: { not: null } },
    select: { id: true, systemeIoId: true },
  });
  return new Map(contacts.map((c) => [c.systemeIoId as number, c.id]));
}

async function upsertSubscription(
  db: PrismaClient,
  sub: SystemeIoSubscription,
  contactIdBySystemeIoId: Map<number, string>
) {
  const contactId = sub.contactSystemeIoId !== null ? (contactIdBySystemeIoId.get(sub.contactSystemeIoId) ?? null) : null;
  await db.subscription.upsert({
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

async function upsertEnrollment(
  db: PrismaClient,
  enrollment: SystemeIoEnrollment,
  contactIdBySystemeIoId: Map<number, string>
) {
  const contactId =
    enrollment.contactSystemeIoId !== null ? (contactIdBySystemeIoId.get(enrollment.contactSystemeIoId) ?? null) : null;
  await db.courseEnrollment.upsert({
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
  db: PrismaClient,
  membership: SystemeIoCommunityMembership,
  contactIdBySystemeIoId: Map<number, string>
) {
  const contactId =
    membership.contactSystemeIoId !== null ? (contactIdBySystemeIoId.get(membership.contactSystemeIoId) ?? null) : null;
  await db.communityMembership.upsert({
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

async function upsertEmailCampaign(db: PrismaClient, campaign: SystemeIoEmailCampaign) {
  await db.emailCampaign.upsert({
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

async function upsertAutomationWorkflow(db: PrismaClient, automation: SystemeIoAutomationWorkflow) {
  await db.automationWorkflow.upsert({
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

// systeme.io's Booking API gives only a bare contactName string, never an
// id — this maps "first last" (lowercased) to a Contact id so bookings can
// be auto-linked on sync. Built once per sync run (not per booking) since
// it needs every contact. A name shared by more than one contact maps to
// null (ambiguous) rather than guessing which one.
async function buildContactNameIndex(db: PrismaClient): Promise<Map<string, string | null>> {
  const contacts = await db.contact.findMany({ select: { id: true, firstName: true, lastName: true } });
  const index = new Map<string, string | null>();
  for (const c of contacts) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim().toLowerCase();
    if (!name) continue;
    index.set(name, index.has(name) ? null : c.id);
  }
  return index;
}

async function upsertBooking(db: PrismaClient, booking: SystemeIoBooking, contactNameIndex: Map<string, string | null>) {
  const matchedContactId = booking.contactName
    ? (contactNameIndex.get(booking.contactName.trim().toLowerCase()) ?? null)
    : null;

  await db.booking.upsert({
    where: { systemeIoId: booking.id },
    update: {
      eventName: booking.eventName,
      eventType: booking.eventType,
      eventDuration: booking.eventDuration,
      maxParticipants: booking.maxParticipants,
      bookedSlots: booking.bookedSlots,
      contactName: booking.contactName,
      contactId: matchedContactId,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      scheduledFor: booking.scheduledFor ? new Date(booking.scheduledFor) : null,
      bookedAt: booking.bookedAt ? new Date(booking.bookedAt) : null,
      raw: booking.raw as never,
    },
    create: {
      systemeIoId: booking.id,
      eventName: booking.eventName,
      eventType: booking.eventType,
      eventDuration: booking.eventDuration,
      maxParticipants: booking.maxParticipants,
      bookedSlots: booking.bookedSlots,
      contactName: booking.contactName,
      contactId: matchedContactId,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      scheduledFor: booking.scheduledFor ? new Date(booking.scheduledFor) : null,
      bookedAt: booking.bookedAt ? new Date(booking.bookedAt) : null,
      raw: booking.raw as never,
    },
  });
}

async function upsertContact(db: PrismaClient, contact: SystemeIoContact) {
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

  const dbContact = await db.contact.upsert({
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
    await db.contactFieldValue.upsert({
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
      await db.tag.upsert({
        where: { systemeIoId: tag.id },
        update: { name: tag.name },
        create: { systemeIoId: tag.id, name: tag.name },
      })
    );
  }

  await db.contactTag.deleteMany({
    where: {
      contactId: dbContact.id,
      tagId: { notIn: tagRecords.map((t) => t.id) },
    },
  });

  for (const tag of tagRecords) {
    await db.contactTag.upsert({
      where: { contactId_tagId: { contactId: dbContact.id, tagId: tag.id } },
      update: {},
      create: { contactId: dbContact.id, tagId: tag.id },
    });
  }
}
