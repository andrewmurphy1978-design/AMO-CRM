-- AlterTable
ALTER TABLE "interactions" ADD COLUMN     "errorCode" TEXT,
ADD COLUMN     "seenAt" TIMESTAMP(3),
ALTER COLUMN "contactId" DROP NOT NULL;


-- Texts received before this existed have already been looked at.
UPDATE "interactions" SET "seenAt" = "createdAt" WHERE "direction" = 'INBOUND';
