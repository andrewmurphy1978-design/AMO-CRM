ALTER TABLE "tasks" ADD COLUMN "assigneeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

UPDATE "tasks" SET "assigneeIds" = ARRAY["assigneeId"] WHERE "assigneeId" IS NOT NULL;
