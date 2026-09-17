-- CreateTable
CREATE TABLE "email_read_states" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_read_states_gmailMessageId_key" ON "email_read_states"("gmailMessageId");

-- CreateTable
CREATE TABLE "email_inbox_cache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emails" JSONB NOT NULL,
    "sentAwaitingReply" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_inbox_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_inbox_cache_userId_key" ON "email_inbox_cache"("userId");
