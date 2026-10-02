UPDATE "proposals" SET "status" = 'APPROVED' WHERE "status" = 'DRAFT' AND "approvedAt" IS NOT NULL;
