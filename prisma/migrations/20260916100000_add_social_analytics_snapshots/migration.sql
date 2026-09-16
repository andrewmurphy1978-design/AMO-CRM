CREATE TABLE IF NOT EXISTS "social_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "followers" INTEGER,
    "engagement" INTEGER,
    "views" INTEGER,
    "raw" JSONB,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_analytics_snapshots_platform_dateKey_key" ON "social_analytics_snapshots"("platform", "dateKey");

CREATE INDEX IF NOT EXISTS "social_analytics_snapshots_platform_capturedAt_idx" ON "social_analytics_snapshots"("platform", "capturedAt");
