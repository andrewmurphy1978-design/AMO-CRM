-- AlterTable
ALTER TABLE "integration_settings" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "automation_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_runs_source_occurredAt_idx" ON "automation_runs"("source", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "automation_runs_source_externalId_key" ON "automation_runs"("source", "externalId");
