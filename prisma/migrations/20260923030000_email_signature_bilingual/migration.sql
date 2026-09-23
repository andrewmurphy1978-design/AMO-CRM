ALTER TABLE "email_signatures" RENAME COLUMN "html" TO "htmlEn";
ALTER TABLE "email_signatures" ADD COLUMN "htmlFr" TEXT NOT NULL DEFAULT '';
