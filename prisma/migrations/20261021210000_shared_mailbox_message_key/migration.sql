DROP INDEX "shared_mailbox_completions_mailboxId_uid_key";
ALTER TABLE "shared_mailbox_completions" RENAME COLUMN "uid" TO "messageKey";
ALTER TABLE "shared_mailbox_completions" ALTER COLUMN "messageKey" TYPE TEXT USING "messageKey"::text;
CREATE UNIQUE INDEX "shared_mailbox_completions_mailboxId_messageKey_key" ON "shared_mailbox_completions"("mailboxId", "messageKey");
