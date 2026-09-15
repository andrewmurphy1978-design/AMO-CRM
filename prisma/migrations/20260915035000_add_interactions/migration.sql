-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE');

-- CreateTable
CREATE TABLE "interactions" (
    "id" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "subject" TEXT,
    "notes" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contactId" TEXT NOT NULL,
    "projectId" TEXT,
    "loggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interactions_contactId_idx" ON "interactions"("contactId");

-- CreateIndex
CREATE INDEX "interactions_projectId_idx" ON "interactions"("projectId");

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
