-- CreateTable
CREATE TABLE "social_video_approvals" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekNumber" INTEGER,
    "slot" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mp4Url" TEXT NOT NULL,
    "tiktokDate" DATE NOT NULL,
    "captions" JSONB NOT NULL,
    "audioSeconds" DOUBLE PRECISION,
    "videoSeconds" DOUBLE PRECISION,
    "canvasUrl" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "feedback" TEXT,
    "scheduledDate" DATE,
    "results" JSONB,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_video_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_video_approvals_status_idx" ON "social_video_approvals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "social_video_approvals_weekStart_slot_key" ON "social_video_approvals"("weekStart", "slot");


-- AlterTable
ALTER TABLE "social_weekly_runs" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'claude';
