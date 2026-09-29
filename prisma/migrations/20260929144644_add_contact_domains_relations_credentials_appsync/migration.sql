-- CreateTable
CREATE TABLE "contact_domains" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "registrar" TEXT,
    "dnsProvider" TEXT,
    "expiryDate" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "managedBy" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_relations" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "relatedContactId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_credentials" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT,
    "username" TEXT,
    "passwordEncrypted" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_app_syncs" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'BOTH',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_app_syncs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_domains_contactId_idx" ON "contact_domains"("contactId");

-- CreateIndex
CREATE INDEX "contact_relations_contactId_idx" ON "contact_relations"("contactId");

-- CreateIndex
CREATE INDEX "contact_relations_relatedContactId_idx" ON "contact_relations"("relatedContactId");

-- CreateIndex
CREATE INDEX "contact_credentials_contactId_idx" ON "contact_credentials"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_app_syncs_contactId_app_key" ON "contact_app_syncs"("contactId", "app");

-- AddForeignKey
ALTER TABLE "contact_domains" ADD CONSTRAINT "contact_domains_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_relations" ADD CONSTRAINT "contact_relations_relatedContactId_fkey" FOREIGN KEY ("relatedContactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_credentials" ADD CONSTRAINT "contact_credentials_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_app_syncs" ADD CONSTRAINT "contact_app_syncs_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
