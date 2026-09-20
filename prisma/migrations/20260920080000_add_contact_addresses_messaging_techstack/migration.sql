-- CreateTable
CREATE TABLE "contact_addresses" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messaging_accounts" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messaging_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_tech_stack_items" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "domain" TEXT,
    "hostingProvider" TEXT,
    "app" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_tech_stack_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_addresses_contactId_idx" ON "contact_addresses"("contactId");

-- CreateIndex
CREATE INDEX "contact_messaging_accounts_contactId_idx" ON "contact_messaging_accounts"("contactId");

-- CreateIndex
CREATE INDEX "contact_tech_stack_items_contactId_idx" ON "contact_tech_stack_items"("contactId");

-- AddForeignKey
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_messaging_accounts" ADD CONSTRAINT "contact_messaging_accounts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_tech_stack_items" ADD CONSTRAINT "contact_tech_stack_items_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry over any real data from the old single "other address"
-- columns into the new contact_addresses table before dropping them, so
-- no existing data is silently lost.
INSERT INTO "contact_addresses" ("id", "contactId", "address", "city", "state", "zip", "country", "order", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text), "id", "otherAddress", "otherCity", "otherState", "otherZip", "otherCountry", 0, now()
FROM "contacts"
WHERE "otherAddress" IS NOT NULL OR "otherCity" IS NOT NULL OR "otherState" IS NOT NULL OR "otherZip" IS NOT NULL;

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "otherAddress",
DROP COLUMN "otherCity",
DROP COLUMN "otherCountry",
DROP COLUMN "otherState",
DROP COLUMN "otherZip";
