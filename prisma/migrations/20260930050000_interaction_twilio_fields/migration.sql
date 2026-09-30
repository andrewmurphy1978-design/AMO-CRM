-- AlterTable
ALTER TABLE "interactions" ADD COLUMN     "deliveryStatus" TEXT,
ADD COLUMN     "direction" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "interactions_externalId_key" ON "interactions"("externalId");

