ALTER TABLE "projects" ADD COLUMN "createBrand" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN "accountMode" TEXT;
-- The Brand question moves from the types' details to the project's General Info.
UPDATE "projects" SET "createBrand" = true WHERE "typeFields"::text LIKE '%"brand": "Y"%';
