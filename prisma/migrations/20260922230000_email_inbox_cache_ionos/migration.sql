-- Adds the IONOS mailbox's own recent-messages snapshot to the existing
-- per-user EmailInboxCache row, refreshed and cached independently of the
-- Gmail fields already there.
ALTER TABLE "email_inbox_cache" ADD COLUMN IF NOT EXISTS "ionosEmails" JSONB;
ALTER TABLE "email_inbox_cache" ADD COLUMN IF NOT EXISTS "ionosFetchedAt" TIMESTAMP(3);
