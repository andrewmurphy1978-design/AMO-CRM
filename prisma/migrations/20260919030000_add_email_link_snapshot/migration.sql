-- AlterTable
ALTER TABLE "email_links"
  ADD COLUMN "subject" TEXT,
  ADD COLUMN "fromLabel" TEXT,
  ADD COLUMN "messageDate" TIMESTAMP(3),
  ADD COLUMN "gmailLink" TEXT;
