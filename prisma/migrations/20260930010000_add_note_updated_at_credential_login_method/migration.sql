-- AlterTable
ALTER TABLE "contact_notes" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing notes have never been edited, so their modified date starts as their created date.
UPDATE "contact_notes" SET "updatedAt" = "createdAt";

-- AlterTable
ALTER TABLE "contact_credentials" ADD COLUMN "loginMethod" TEXT;
