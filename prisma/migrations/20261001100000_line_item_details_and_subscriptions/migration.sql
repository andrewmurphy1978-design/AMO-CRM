-- AlterTable
ALTER TABLE "proposal_line_items" ADD COLUMN "details" TEXT;

-- AlterTable
ALTER TABLE "invoice_line_items" ADD COLUMN "details" TEXT;

-- AlterTable
ALTER TABLE "proposals" ADD COLUMN "subscriptions" JSONB;
