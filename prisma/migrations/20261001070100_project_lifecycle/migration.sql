-- The old "Planning" project status is now "Proposal"
UPDATE "projects" SET "status" = 'PROPOSAL' WHERE "status" = 'PLANNING';
ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'PROPOSAL';

-- AlterTable
ALTER TABLE "proposal_payment_schedule_items" ADD COLUMN "paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paidAt" TIMESTAMP(3);
