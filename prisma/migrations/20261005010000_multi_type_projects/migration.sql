-- A project can combine several types of work, each with its own details.
ALTER TABLE "projects" ADD COLUMN "types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "projects" ADD COLUMN "typeFields" JSONB;
UPDATE "projects" SET "types" = ARRAY["type"];
UPDATE "projects" SET "typeFields" = jsonb_build_object("type", "customFields") WHERE "customFields" IS NOT NULL;
UPDATE "tasks" SET "title" = 'Receive the signed proposal and 1st instalment' WHERE "title" = 'Receive the 1st instalment';
