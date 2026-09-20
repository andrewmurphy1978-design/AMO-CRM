-- CreateTable
CREATE TABLE "exchange_rate_cache" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "base" TEXT NOT NULL DEFAULT 'CAD',
    "rates" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_cache_pkey" PRIMARY KEY ("id")
);
