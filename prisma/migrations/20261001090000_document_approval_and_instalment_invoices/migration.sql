-- AlterTable
ALTER TABLE "proposals" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "instalmentId" TEXT;

-- CreateIndex
CREATE INDEX "invoices_instalmentId_idx" ON "invoices"("instalmentId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_instalmentId_fkey" FOREIGN KEY ("instalmentId") REFERENCES "proposal_payment_schedule_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
