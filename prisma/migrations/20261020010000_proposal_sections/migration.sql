-- CreateEnum
CREATE TYPE "ProposalLayout" AS ENUM ('COMBINED', 'SECTIONED');

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN "layout" "ProposalLayout" NOT NULL DEFAULT 'COMBINED';

-- CreateTable
CREATE TABLE "proposal_sections" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposal_sections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposal_sections_proposalId_idx" ON "proposal_sections"("proposalId");

ALTER TABLE "proposal_sections" ADD CONSTRAINT "proposal_sections_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "proposal_line_items" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "proposal_payment_schedule_items" ADD COLUMN "sectionId" TEXT;

CREATE INDEX "proposal_line_items_sectionId_idx" ON "proposal_line_items"("sectionId");
CREATE INDEX "proposal_payment_schedule_items_sectionId_idx" ON "proposal_payment_schedule_items"("sectionId");

ALTER TABLE "proposal_line_items" ADD CONSTRAINT "proposal_line_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "proposal_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposal_payment_schedule_items" ADD CONSTRAINT "proposal_payment_schedule_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "proposal_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
