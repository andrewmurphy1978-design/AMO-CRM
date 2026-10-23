CREATE TABLE "social_weekly_runs" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "posts" JSONB,
    "errors" JSONB,
    "note" TEXT,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_weekly_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "social_weekly_runs_weekStart_idx" ON "social_weekly_runs"("weekStart");
