CREATE TABLE "shared_mailboxes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'imap',
    "credentialsEncrypted" TEXT NOT NULL,
    "sentMailbox" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shared_mailboxes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shared_mailbox_access" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    CONSTRAINT "shared_mailbox_access_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shared_mailbox_completions" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "completedBy" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_mailbox_completions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shared_mailbox_access_mailboxId_userId_key" ON "shared_mailbox_access"("mailboxId", "userId");
CREATE UNIQUE INDEX "shared_mailbox_completions_mailboxId_uid_key" ON "shared_mailbox_completions"("mailboxId", "uid");

ALTER TABLE "shared_mailbox_access" ADD CONSTRAINT "shared_mailbox_access_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "shared_mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shared_mailbox_access" ADD CONSTRAINT "shared_mailbox_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shared_mailbox_completions" ADD CONSTRAINT "shared_mailbox_completions_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "shared_mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
