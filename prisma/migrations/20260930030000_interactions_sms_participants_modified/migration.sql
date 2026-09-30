-- AlterEnum
ALTER TYPE "InteractionType" ADD VALUE 'SMS';

-- AlterTable
ALTER TABLE "interactions" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedById" TEXT;

-- Existing calls/notes have never been edited: modified starts equal to created.
UPDATE "interactions" SET "updatedAt" = "createdAt";

-- CreateTable
CREATE TABLE "interaction_participants" (
    "id" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "contactId" TEXT,
    "userId" TEXT,

    CONSTRAINT "interaction_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interaction_participants_interactionId_idx" ON "interaction_participants"("interactionId");

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "interactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaction_participants" ADD CONSTRAINT "interaction_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
