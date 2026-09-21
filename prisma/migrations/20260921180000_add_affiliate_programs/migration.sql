-- CreateEnum
CREATE TYPE "AffiliateProgramTab" AS ENUM ('AI_TOOLS', 'TRAINING_PROGRAMS', 'BUSINESS_OPPORTUNITIES');

-- CreateTable
CREATE TABLE "affiliate_programs" (
    "id" TEXT NOT NULL,
    "tab" "AffiliateProgramTab" NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "category" TEXT,
    "shortioCreated" BOOLEAN NOT NULL DEFAULT false,
    "brandedLink" TEXT,
    "destinationLink" TEXT,
    "affiliateStatus" TEXT,
    "frenchSlug" TEXT,
    "frenchLink" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "accountPlan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "affiliate_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_programs_tab_name_key" ON "affiliate_programs"("tab", "name");

-- AlterTable
ALTER TABLE "email_links" ADD COLUMN "affiliateProgramId" TEXT;

-- CreateIndex
CREATE INDEX "email_links_affiliateProgramId_idx" ON "email_links"("affiliateProgramId");

-- AddForeignKey
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_affiliateProgramId_fkey" FOREIGN KEY ("affiliateProgramId") REFERENCES "affiliate_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
