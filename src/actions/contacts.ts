"use server";

import { z } from "zod";
import type { Contact } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient, type PrismaClient } from "@/lib/prisma";
import { getSystemeIoClient } from "@/lib/sync";
import { DEFAULT_PUSH_FIELD_SLUGS } from "@/lib/systemeio";
import { countryToCode } from "@/lib/country-flag";
import { getDict } from "@/lib/i18n/dictionaries";
import { getValidAccessToken } from "@/lib/google";
import { pushContactToGoogle, deleteGoogleContact, createGoogleContact, syncGoogleContactGroups } from "@/lib/google-contacts";
import { CONTACT_SYNC_APPS, type ContactSyncDirection } from "@/lib/contact-sync";
import { isSystemeIoPushable } from "@/lib/tag-colors";
import {
  readContactForm,
  readSocialLinks,
  readExtraAddresses,
  readMessagingAccounts,
  readVoipAccounts,
  buildCustomFieldEditOps,
  readTechStackItems,
  readDomainItems,
  readContactRelations,
  readAppSyncSettings,
} from "@/lib/contact-form-fields";

// Core tag-add logic, taking a shared scoped client — callers that already
// have one open (createContact's tag loop, syncContactTags) pass it in
// directly instead of each opening their own fresh connection. The
// exported `addTagToContact` below is the entry point for callers that
// don't have one yet (e.g. a standalone "add tag" button).
async function addTagToContactWith(db: PrismaClient, contactId: string, tagName: string, actingUserId: string) {
  const name = tagName.trim();
  if (!name) return;

  const tag = await db.tag.upsert({
    where: { name },
    update: {},
    create: { name },
  });

  await db.contactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: tag.id } },
    update: {},
    create: { contactId, tagId: tag.id },
  });

  const contact = await db.contact.findUnique({ where: { id: contactId } });

  // Best-effort push back to systeme.io — never fails the CRM save itself.
  // PERSONAL tags (e.g. "Famille", "Fournisseur" — managed from Settings)
  // are CRM-only and never created/attached on systeme.io; see
  // isSystemeIoPushable in tag-colors.ts.
  if (isSystemeIoPushable(tag)) {
    try {
      if (contact?.systemeIoId) {
        const client = await getSystemeIoClient(db);
        if (client) {
          let systemeIoTagId = tag.systemeIoId;
          if (!systemeIoTagId) {
            const created = await client.createTag(tag.name);
            systemeIoTagId = created.id;
            await db.tag.update({ where: { id: tag.id }, data: { systemeIoId: created.id } });
          }
          await client.addTagToContact(contact.systemeIoId, systemeIoTagId);
        }
      }
    } catch {
      // Tag is still saved locally even if the systeme.io push fails.
    }
  }

  await syncContactGoogleGroupsWith(db, contactId, contact?.googleContactId, actingUserId);

  revalidatePath(`/contacts/${contactId}`);
}

async function removeTagFromContactWith(db: PrismaClient, contactId: string, tagId: string, actingUserId: string) {
  await db.contactTag.delete({
    where: { contactId_tagId: { contactId, tagId } },
  });

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  const tag = await db.tag.findUnique({ where: { id: tagId } });

  // Best-effort push back to systeme.io — never fails the CRM save itself.
  try {
    if (contact?.systemeIoId && tag?.systemeIoId) {
      const client = await getSystemeIoClient(db);
      if (client) {
        await client.removeTagFromContact(contact.systemeIoId, tag.systemeIoId);
      }
    }
  } catch {
    // Non-fatal — the tag is still removed locally either way.
  }

  await syncContactGoogleGroupsWith(db, contactId, contact?.googleContactId, actingUserId);

  revalidatePath(`/contacts/${contactId}`);
}

// Best-effort — mirrors this contact's full current tag set (every
// category, per the "assign all tags to Google" ask) onto its Google
// contact groups. Called after every tag add/remove so Google stays in
// sync even outside a full contact-form save. Uses the acting user's own
// Google connection (whoever is logged in and made the change), same as
// every other Google push in this file.
async function syncContactGoogleGroupsWith(db: PrismaClient, contactId: string, googleContactId: string | null | undefined, actingUserId: string) {
  if (!googleContactId) return;
  try {
    const currentTags = await db.contactTag.findMany({ where: { contactId }, include: { tag: true } });
    const accessToken = await getValidAccessToken(actingUserId, db);
    if (!accessToken) return;
    await syncGoogleContactGroups(accessToken, googleContactId, currentTags.map((ct) => ct.tag.name));
  } catch {
    // Best-effort — never blocks the tag change itself.
  }
}

async function syncContactTagsWith(db: PrismaClient, contactId: string, desiredNames: string[], actingUserId: string) {
  const current = await db.contactTag.findMany({ where: { contactId }, include: { tag: true } });
  const currentNames = new Set(current.map((ct) => ct.tag.name));
  const desiredSet = new Set(desiredNames);

  for (const name of desiredNames) {
    if (!currentNames.has(name)) {
      await addTagToContactWith(db, contactId, name, actingUserId);
    }
  }
  for (const ct of current) {
    if (!desiredSet.has(ct.tag.name)) {
      await removeTagFromContactWith(db, contactId, ct.tagId, actingUserId);
    }
  }
}

// Creates this contact in whichever CONTACT_SYNC_APPS app is enabled
// (direction TO_APP/BOTH) but doesn't have a link id yet — the missing
// "create" half of what updateContact's existing push blocks only ever did
// for a contact that was *already* linked. Called after the contact row
// (and its ContactAppSync settings) are saved, from both createContact (a
// brand-new CRM contact, most relevantly for google_contacts per the
// user's ask) and updateContact (a contact whose sync was just turned on
// for an app it isn't linked to yet). Best-effort, like every other push in
// this file — never throws, always returns a status string to append.
async function syncMissingAppLinksWith(
  db: PrismaClient,
  session: { user: { id: string } },
  contact: { id: string; email: string | null; locale: string | null; googleContactId: string | null; systemeIoId: number | null } & Record<string, unknown>,
  appSyncRows: { app: string; enabled: boolean; direction: ContactSyncDirection }[],
  t: ReturnType<typeof getDict>
): Promise<string> {
  let status = "";
  for (const row of appSyncRows) {
    if (!row.enabled || row.direction === "FROM_APP") continue;
    const def = CONTACT_SYNC_APPS.find((d) => d.app === row.app);
    if (!def) continue;
    if (contact[def.idField]) continue; // already linked — the update-push blocks own this one

    if (def.app === "google_contacts") {
      try {
        const accessToken = await getValidAccessToken(session.user.id, db);
        if (accessToken) {
          const created = await createGoogleContact(accessToken, contact as unknown as import("@/lib/google-contacts").ContactPushInput);
          if (created.resourceName) {
            await db.contact.update({ where: { id: contact.id }, data: { googleContactId: created.resourceName } });
            status += t.actions.contactCreatedGoogleSynced;
          } else if (created.error) {
            status += t.actions.contactUpdatedGoogleWarning(created.error);
          }
        }
      } catch (error) {
        status += t.actions.contactUpdatedGoogleWarning(error instanceof Error ? error.message : "unknown error");
      }
    }

    if (def.app === "systeme_io" && contact.email) {
      try {
        const client = await getSystemeIoClient(db);
        if (client) {
          const fields: Record<string, string> = {};
          for (const [column, slug] of Object.entries(DEFAULT_PUSH_FIELD_SLUGS)) {
            const value = contact[column];
            if (!value || typeof value !== "string") continue;
            fields[slug] = column === "country" ? (countryToCode(value) ?? value) : value;
          }
          const created = await client.createContact(contact.email, fields, contact.locale ?? undefined);
          await db.contact.update({ where: { id: contact.id }, data: { systemeIoId: created.id } });
          status += t.actions.contactCreatedSystemeIoSynced;
        }
      } catch (error) {
        status += t.actions.contactUpdatedWarning(error instanceof Error ? error.message : "unknown error");
      }
    }
  }
  return status;
}

// Best-effort push back to systeme.io/Google Contacts for a contact that's
// already linked to one (or both), plus the authoritative Google group
// (tag) sync — shared by updateContact's whole-form save and by every
// per-card section action in contact-sections.ts, since any of them can
// touch a column DEFAULT_PUSH_FIELD_SLUGS pushes or change tags indirectly
// via createContact's own Google link. `updated` is expected to be the full
// Contact row straight out of a `db.contact.update()` with no `select` —
// every DEFAULT_PUSH_FIELD_SLUGS column and ContactPushInput field needs to
// be present on it. Never throws; always returns a status string to append
// to the caller's own "Contact updated" message.
export async function applyContactExternalSyncs(
  db: PrismaClient,
  session: { user: { id: string } },
  updated: Contact,
  appSyncRows: { app: string; enabled: boolean; direction: ContactSyncDirection }[],
  t: ReturnType<typeof getDict>
): Promise<string> {
  const systemeSync = appSyncRows.find((row) => row.app === "systeme_io");
  const googleSync = appSyncRows.find((row) => row.app === "google_contacts");
  let syncStatus = "";

  if (updated.systemeIoId && systemeSync?.enabled && systemeSync.direction !== "FROM_APP") {
    try {
      const client = await getSystemeIoClient(db);
      if (client) {
        const fields: Record<string, string> = {};
        for (const [column, slug] of Object.entries(DEFAULT_PUSH_FIELD_SLUGS)) {
          const value = (updated as unknown as Record<string, string | undefined>)[column];
          if (!value) continue;
          // systeme.io's "country" field expects a 2-letter ISO 3166 code
          // (per its API docs), not the full country name the CRM stores.
          fields[slug] = column === "country" ? (countryToCode(value) ?? value) : value;
        }
        const { skipped } = await client.updateContactFields(updated.systemeIoId, fields);
        syncStatus = skipped.length > 0 ? t.actions.contactUpdatedPartialWarning(skipped) : t.actions.contactUpdatedSystemeIoSynced;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      syncStatus = t.actions.contactUpdatedWarning(message);
    }
  }

  // Requires the read/write `contacts` scope (see api/google/connect/
  // route.ts); an account still on the older contacts.readonly grant needs
  // to reconnect once before this can succeed.
  if (updated.googleContactId && googleSync?.enabled && googleSync.direction !== "FROM_APP") {
    try {
      const accessToken = await getValidAccessToken(session.user.id, db);
      if (accessToken) {
        const pushResult = await pushContactToGoogle(accessToken, updated.googleContactId, updated);
        syncStatus += pushResult.error ? t.actions.contactUpdatedGoogleWarning(pushResult.error) : t.actions.contactUpdatedGoogleSynced;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      syncStatus += t.actions.contactUpdatedGoogleWarning(message);
    }
  }

  // Assigns every one of this contact's current tags (every category, per
  // the "assign all tags" ask) as Google contact groups — re-read fresh
  // here rather than taken as a parameter, since a section action that
  // doesn't touch tags at all (e.g. Addresses) still needs this to reflect
  // whatever the tags actually are right now.
  if (googleSync?.enabled && googleSync.direction !== "FROM_APP" && updated.googleContactId) {
    try {
      const tagRows = await db.contactTag.findMany({ where: { contactId: updated.id }, include: { tag: true } });
      const accessToken = await getValidAccessToken(session.user.id, db);
      if (accessToken) await syncGoogleContactGroups(accessToken, updated.googleContactId, tagRows.map((ct) => ct.tag.name));
    } catch {
      // Best-effort — the field-level push above already reported sync status.
    }
  }

  return syncStatus;
}

export async function createContact(
  _prevState: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readContactForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  // One shared client for the whole action — the duplicate-email check,
  // the create, every tag upsert, and the activity log entry all reuse it
  // instead of each opening its own fresh Hyperdrive connection (the
  // regular `prisma` proxy opens a new one per property access, and this
  // action alone used to make double digits of them with a few tags).
  const result = await withScopedPrismaClient(async (db) => {
    if (data.email) {
      const existing = await db.contact.findUnique({ where: { email: data.email } });
      if (existing) {
        return { error: t.actions.contactEmailExists };
      }
    }

    const contact = await db.contact.create({
      data: { ...data, source: "manual", ownerId: session.user.id },
    });

    const socialLinks = readSocialLinks(formData);
    if (socialLinks.length > 0) {
      await db.contactSocialLink.createMany({
        data: socialLinks.map((link) => ({ ...link, contactId: contact.id })),
      });
    }

    const extraAddresses = readExtraAddresses(formData);
    if (extraAddresses.length > 0) {
      await db.contactAddress.createMany({
        data: extraAddresses.map((addr) => ({ ...addr, contactId: contact.id })),
      });
    }

    const messagingAccounts = readMessagingAccounts(formData);
    if (messagingAccounts.length > 0) {
      await db.contactMessagingAccount.createMany({
        data: messagingAccounts.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const voipAccounts = readVoipAccounts(formData);
    if (voipAccounts.length > 0) {
      await db.contactVoipAccount.createMany({
        data: voipAccounts.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const techStackItems = readTechStackItems(formData);
    if (techStackItems.length > 0) {
      await db.contactTechStackItem.createMany({
        data: techStackItems.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const domains = readDomainItems(formData);
    if (domains.length > 0) {
      await db.contactDomain.createMany({
        data: domains.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const relations = readContactRelations(formData);
    if (relations.length > 0) {
      await db.contactRelation.createMany({
        data: relations.map((row) => ({ ...row, contactId: contact.id })),
      });
    }

    const appSyncRows = readAppSyncSettings(formData);
    await db.$transaction(
      appSyncRows.map((row) =>
        db.contactAppSync.upsert({
          where: { contactId_app: { contactId: contact.id, app: row.app } },
          update: { enabled: row.enabled, direction: row.direction },
          create: { contactId: contact.id, app: row.app, enabled: row.enabled, direction: row.direction },
        })
      )
    );

    const customFieldOps = buildCustomFieldEditOps(db, contact.id, formData);
    if (customFieldOps.length > 0) {
      await db.$transaction(customFieldOps);
    }

    const desiredTags = formData.getAll("tags").map(String).filter(Boolean);
    for (const name of desiredTags) {
      await addTagToContactWith(db, contact.id, name, session.user.id);
    }

    const syncStatus = await syncMissingAppLinksWith(db, session, contact, appSyncRows, t);

    // Assign every tag (any category) to the Google contact groups now that
    // syncMissingAppLinksWith may have just linked this brand-new contact
    // to Google — each addTagToContactWith call above no-opped on this
    // since there was no googleContactId yet at that point.
    if (desiredTags.length > 0) {
      const googleContactId = (await db.contact.findUnique({ where: { id: contact.id }, select: { googleContactId: true } }))?.googleContactId;
      if (googleContactId) {
        try {
          const accessToken = await getValidAccessToken(session.user.id, db);
          if (accessToken) await syncGoogleContactGroups(accessToken, googleContactId, desiredTags);
        } catch {
          // Best-effort — never blocks contact creation.
        }
      }
    }

    await db.activityLogEntry.create({
      data: {
        contactId: contact.id,
        userId: session.user.id,
        message: t.actions.createdContact(session.user.name ?? "") + syncStatus,
      },
    });

    return { contactId: contact.id };
  });

  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/contacts");
  redirect(`/contacts/${result.contactId}`);
}

export async function updateContact(
  contactId: string,
  _prevState: { error?: string; success?: string } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  let data;
  try {
    data = readContactForm(formData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { error: error.issues[0]?.message ?? t.actions.invalidInput };
    }
    throw error;
  }

  // One shared client for the whole action — see the comment on
  // createContact above for why. This one used to open a connection for
  // the duplicate-email check, the update, syncContactTags's own queries
  // (findMany plus one upsert pair per changed tag), and the systeme.io
  // push's own lookups — 15+ for a save with a couple of tag changes, and
  // has only grown since (jurisdiction/billing fields, messaging accounts,
  // VoIP accounts). Each of those extra round trips is real wall-clock time
  // against Hyperdrive/Neon within the one Cloudflare Workers invocation
  // handling this request — stack up enough of them (this used to be 10
  // separate awaits just for the 5 child collections below, one deleteMany
  // + createMany pair apiece) and the request risks the Workers CPU/time
  // budget, which surfaces to the user as a plain "Error 1102" with no
  // useful detail, and can leave this request's DB connection in-flight
  // (never reaching the `finally` in withScopedPrismaClient that would
  // close it) if the isolate gets killed mid-request — which then trips up
  // unrelated requests too until Neon reaps the abandoned connection. The
  // fix here isn't fewer statements (the full-replace-per-collection
  // approach is unchanged) but fewer *round trips*: every child-row write
  // below goes into one batched $transaction instead of 10+ sequential
  // `await`s.
  const result = await withScopedPrismaClient(async (db) => {
    if (data.email) {
      const existing = await db.contact.findFirst({
        where: { email: data.email, NOT: { id: contactId } },
      });
      if (existing) {
        return { error: t.actions.contactEmailExistsOther };
      }
    }

    const updated = await db.contact.update({ where: { id: contactId }, data });

    // Full replace, not a diff — simplest correct sync for a small,
    // order-sensitive list with no other side effects (unlike tags, nothing
    // else references a social link by id).
    const socialLinks = readSocialLinks(formData);
    const extraAddresses = readExtraAddresses(formData);
    const messagingAccounts = readMessagingAccounts(formData);
    const voipAccounts = readVoipAccounts(formData);
    const techStackItems = readTechStackItems(formData);
    const domains = readDomainItems(formData);
    const relations = readContactRelations(formData);
    const appSyncRows = readAppSyncSettings(formData);

    await db.$transaction([
      db.contactSocialLink.deleteMany({ where: { contactId } }),
      ...(socialLinks.length > 0
        ? [db.contactSocialLink.createMany({ data: socialLinks.map((link) => ({ ...link, contactId })) })]
        : []),
      db.contactAddress.deleteMany({ where: { contactId } }),
      ...(extraAddresses.length > 0
        ? [db.contactAddress.createMany({ data: extraAddresses.map((addr) => ({ ...addr, contactId })) })]
        : []),
      db.contactMessagingAccount.deleteMany({ where: { contactId } }),
      ...(messagingAccounts.length > 0
        ? [db.contactMessagingAccount.createMany({ data: messagingAccounts.map((row) => ({ ...row, contactId })) })]
        : []),
      db.contactVoipAccount.deleteMany({ where: { contactId } }),
      ...(voipAccounts.length > 0
        ? [db.contactVoipAccount.createMany({ data: voipAccounts.map((row) => ({ ...row, contactId })) })]
        : []),
      db.contactTechStackItem.deleteMany({ where: { contactId } }),
      ...(techStackItems.length > 0
        ? [db.contactTechStackItem.createMany({ data: techStackItems.map((row) => ({ ...row, contactId })) })]
        : []),
      db.contactDomain.deleteMany({ where: { contactId } }),
      ...(domains.length > 0 ? [db.contactDomain.createMany({ data: domains.map((row) => ({ ...row, contactId })) })] : []),
      db.contactRelation.deleteMany({ where: { contactId } }),
      ...(relations.length > 0 ? [db.contactRelation.createMany({ data: relations.map((row) => ({ ...row, contactId })) })] : []),
      ...appSyncRows.map((row) =>
        db.contactAppSync.upsert({
          where: { contactId_app: { contactId, app: row.app } },
          update: { enabled: row.enabled, direction: row.direction },
          create: { contactId, app: row.app, enabled: row.enabled, direction: row.direction },
        })
      ),
      ...buildCustomFieldEditOps(db, contactId, formData),
    ]);

    const desiredTags = formData.getAll("tags").map(String).filter(Boolean);
    await syncContactTagsWith(db, contactId, desiredTags, session.user.id);

    // Best-effort push back to systeme.io/Google Contacts, plus the
    // authoritative Google group (tag) sync — shared with the per-card
    // section actions in contact-sections.ts, since every one of those
    // touches the same two external services and must report the same
    // "Contact updated, systeme.io/Google warning" status shape.
    let syncStatus = await applyContactExternalSyncs(db, session, updated, appSyncRows, t);

    // Create this contact in any app that's enabled but not linked yet —
    // e.g. sync to Google Contacts was just turned on for a contact that
    // has never been pushed there before.
    syncStatus += await syncMissingAppLinksWith(db, session, updated, appSyncRows, t);

    return { syncStatus };
  });

  if ("error" in result) {
    return { error: result.error };
  }

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${contactId}`);
  return { success: `${t.actions.contactUpdated}${result.syncStatus}` };
}

export async function deleteContact(contactId: string): Promise<never> {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const syncStatus = await withScopedPrismaClient(async (db) => {
    const contact = await db.contact.findUnique({
      where: { id: contactId },
      select: { systemeIoId: true, googleContactId: true },
    });

    // Best-effort deletes on the linked services first, while the contact's
    // own ids are still around to look them up by — never fails the CRM
    // delete itself, but reported either way so "Contact deleted" doesn't
    // leave the user guessing whether the other side actually got it too.
    let status = "";
    if (contact?.systemeIoId) {
      try {
        const client = await getSystemeIoClient(db);
        if (client) {
          await client.deleteContact(contact.systemeIoId);
          status += t.actions.contactDeletedSystemeIoSynced;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        status += t.actions.contactDeletedSystemeIoWarning(message);
      }
    }

    if (contact?.googleContactId) {
      try {
        const accessToken = await getValidAccessToken(session.user.id, db);
        if (accessToken) {
          const result = await deleteGoogleContact(accessToken, contact.googleContactId);
          status += result.error ? t.actions.contactDeletedGoogleWarning(result.error) : t.actions.contactDeletedGoogleSynced;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        status += t.actions.contactDeletedGoogleWarning(message);
      }
    }

    await db.contact.delete({ where: { id: contactId } });
    return status;
  });

  revalidatePath("/contacts");
  // A Server Action's own page re-renders automatically once the action
  // resolves — since this contact is now gone, staying on `/contacts/[id]`
  // would just re-render into that route's own "not found" page, wiping
  // out any client-side toast state in the process. Redirecting here
  // (server-side, before the client ever gets a chance to render that) and
  // carrying the message as a query param is what lets the Contacts list
  // show it instead.
  redirect(`/contacts?deleted=${encodeURIComponent(`${t.actions.contactDeleted}${syncStatus}`)}`);
}

export async function addTagToContact(contactId: string, tagName: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  await withScopedPrismaClient((db) => addTagToContactWith(db, contactId, tagName, session.user.id));
}

export async function removeTagFromContact(contactId: string, tagId: string) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  await withScopedPrismaClient((db) => removeTagFromContactWith(db, contactId, tagId, session.user.id));
}

export async function addContactNote(contactId: string, formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Not authenticated");
  const t = getDict(session.user.language === "FR" ? "fr" : "en");

  const message = String(formData.get("note") ?? "").trim();
  if (!message) return;

  await withScopedPrismaClient((db) =>
    db.activityLogEntry.create({
      data: {
        contactId,
        userId: session.user.id,
        message: t.actions.addedNote(session.user.name ?? "", message),
      },
    })
  );

  revalidatePath(`/contacts/${contactId}`);
}
