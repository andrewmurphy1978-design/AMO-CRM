-- Additional phones/emails beyond the first two, added via the Contact form's "+" button.
ALTER TABLE "contacts" ADD COLUMN "extraPhones" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "contacts" ADD COLUMN "extraEmails" TEXT[] NOT NULL DEFAULT '{}';
