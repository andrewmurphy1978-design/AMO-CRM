ALTER TABLE "social_analytics_snapshots" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'EN';

DROP INDEX IF EXISTS "social_analytics_snapshots_platform_dateKey_key";
DROP INDEX IF EXISTS "social_analytics_snapshots_platform_capturedAt_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "social_analytics_snapshots_platform_language_dateKey_key" ON "social_analytics_snapshots"("platform", "language", "dateKey");
CREATE INDEX IF NOT EXISTS "social_analytics_snapshots_platform_language_capturedAt_idx" ON "social_analytics_snapshots"("platform", "language", "capturedAt");
