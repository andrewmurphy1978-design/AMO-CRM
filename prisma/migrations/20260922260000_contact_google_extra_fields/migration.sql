-- Fields only Google Contacts (not systeme.io) ever populates, added so
-- the Google Contacts import can pull in every field Google offers
-- rather than just name/email/phone/company.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "birthday" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "nickname" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;
