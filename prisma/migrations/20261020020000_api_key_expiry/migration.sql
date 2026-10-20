-- AlterTable
ALTER TABLE "integration_settings" ADD COLUMN "apiKeyExpiresAt" TIMESTAMP(3),
ADD COLUMN "apiKeyNoExpiry" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "api_key_vault_entries" ADD COLUMN "source" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "noExpiry" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "api_key_vault_entries_source_key" ON "api_key_vault_entries"("source");
