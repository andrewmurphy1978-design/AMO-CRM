-- AlterTable
ALTER TABLE "bookings" ADD COLUMN "contactId" TEXT;

-- CreateIndex
CREATE INDEX "bookings_contactId_idx" ON "bookings"("contactId");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
