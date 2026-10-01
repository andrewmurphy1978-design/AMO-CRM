-- AlterTable
ALTER TABLE "contact_credentials" ADD COLUMN "apiKeyEncrypted" TEXT,
ADD COLUMN "apiKeyLast4" TEXT,
ADD COLUMN "shareApiKeyWithAi" BOOLEAN NOT NULL DEFAULT false;
