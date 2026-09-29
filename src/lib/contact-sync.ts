// Registry of external apps a Contact can be kept in sync with, beyond the
// two built-in systemeIoId/googleContactId columns already on Contact.
// Adding a third/fourth app later (e.g. a different CRM/ESP) means adding a
// new entry here plus its create/update functions in that app's own lib
// file — the ContactAppSync row shape (app: string) never needs a migration.

export type ContactSyncDirection = "TO_APP" | "FROM_APP" | "BOTH";

export interface ContactSyncAppDef {
  app: string;
  labelKey: string;
  // Which Contact column holds this app's external id, used to decide
  // "create" vs "update" when pushing.
  idField: "systemeIoId" | "googleContactId";
}

export const CONTACT_SYNC_APPS: ContactSyncAppDef[] = [
  {
    app: "google_contacts",
    labelKey: "googleContacts",
    idField: "googleContactId",
  },
  {
    app: "systeme_io",
    labelKey: "systemeIo",
    idField: "systemeIoId",
  },
];

export function defaultSyncDirection(): ContactSyncDirection {
  return "BOTH";
}
