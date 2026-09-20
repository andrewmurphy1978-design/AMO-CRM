-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "timeZone" TEXT;

-- CreateTable
CREATE TABLE "contact_voip_accounts" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_voip_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_voip_accounts_contactId_idx" ON "contact_voip_accounts"("contactId");

-- AddForeignKey
ALTER TABLE "contact_voip_accounts" ADD CONSTRAINT "contact_voip_accounts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: WhatsApp moves from its own dedicated column into the unified
-- instant-messaging-apps table (contact_messaging_accounts), as just
-- another app row, before the old column is dropped.
INSERT INTO "contact_messaging_accounts" ("id", "contactId", "app", "handle", "order", "createdAt")
SELECT
  md5(random()::text || clock_timestamp()::text),
  "id",
  'WhatsApp',
  "whatsapp",
  (SELECT COUNT(*) FROM "contact_messaging_accounts" m WHERE m."contactId" = "contacts"."id"),
  now()
FROM "contacts"
WHERE "whatsapp" IS NOT NULL AND "whatsapp" <> '';

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "whatsapp";
