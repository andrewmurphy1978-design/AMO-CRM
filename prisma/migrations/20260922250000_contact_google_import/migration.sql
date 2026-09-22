-- Google Contacts import (pull direction): personal/old contacts pulled
-- from Google People API commonly have no email, and every new contact
-- needs a way to avoid being re-created on a repeat import.

ALTER TYPE "ContactStage" ADD VALUE IF NOT EXISTS 'PERSONAL';

ALTER TABLE "contacts" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "googleContactId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "contacts_googleContactId_key" ON "contacts"("googleContactId");
