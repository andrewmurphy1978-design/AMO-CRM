-- AlterTable
ALTER TABLE "affiliate_programs"
  ADD COLUMN "applyUrl" TEXT,
  ADD COLUMN "applyPlatform" TEXT,
  ADD COLUMN "followUpDate" DATE,
  ADD COLUMN "hasApi" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "apiKeyEncrypted" TEXT,
  ADD COLUMN "shortioLinkId" TEXT,
  ADD COLUMN "shortioLinkIdFr" TEXT,
  ADD COLUMN "shortioClicks" INTEGER,
  ADD COLUMN "shortioClicksFr" INTEGER,
  ADD COLUMN "shortioStats" JSONB,
  ADD COLUMN "shortioStatsFr" JSONB,
  ADD COLUMN "shortioStatsSyncedAt" TIMESTAMP(3);
