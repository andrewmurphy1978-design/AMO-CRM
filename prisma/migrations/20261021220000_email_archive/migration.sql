CREATE TABLE "email_archive" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "threadKey" TEXT,
    "subject" TEXT,
    "fromLabel" TEXT,
    "messageDate" TIMESTAMP(3),
    "rawBase64" TEXT NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "archivedById" TEXT,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_archive_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "email_archive_source_messageKey_key" ON "email_archive"("source", "messageKey");
CREATE INDEX "email_archive_threadKey_idx" ON "email_archive"("threadKey");
