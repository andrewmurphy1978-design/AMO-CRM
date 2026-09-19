-- CreateTable
CREATE TABLE "personal_inbox_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emails" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_inbox_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_inbox_cache_userId_key" ON "personal_inbox_cache"("userId");
