-- CreateTable
CREATE TABLE IF NOT EXISTS "ionos_mailbox_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT,
    "credentialsEncrypted" TEXT NOT NULL,
    "sentMailbox" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ionos_mailbox_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ionos_mailbox_accounts_userId_key" ON "ionos_mailbox_accounts"("userId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ionos_mailbox_accounts_userId_fkey'
  ) THEN
    ALTER TABLE "ionos_mailbox_accounts"
      ADD CONSTRAINT "ionos_mailbox_accounts_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
