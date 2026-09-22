-- Tracks each message sent from the IONOS mailbox via SMTP, since IONOS
-- has no equivalent to Gmail's own "Sent" folder/thread API to query
-- awaiting-reply status live from.
CREATE TABLE IF NOT EXISTS "sent_email_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'awaiting',

    CONSTRAINT "sent_email_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sent_email_records_messageId_key" ON "sent_email_records"("messageId");
CREATE INDEX IF NOT EXISTS "sent_email_records_userId_idx" ON "sent_email_records"("userId");

ALTER TABLE "sent_email_records"
  ADD CONSTRAINT "sent_email_records_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
