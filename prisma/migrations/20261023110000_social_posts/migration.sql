CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "bufferId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT,
    "link" TEXT,
    "postedAt" TIMESTAMP(3),
    "metrics" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "social_posts_provider_bufferId_key" ON "social_posts"("provider", "bufferId");
CREATE INDEX "social_posts_platform_status_postedAt_idx" ON "social_posts"("platform", "status", "postedAt");
