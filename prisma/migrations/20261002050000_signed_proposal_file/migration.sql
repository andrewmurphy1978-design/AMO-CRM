ALTER TABLE "proposals" ADD COLUMN "signedFileName" TEXT, ADD COLUMN "signedFileMime" TEXT, ADD COLUMN "signedFileData" BYTEA, ADD COLUMN "signedAt" TIMESTAMP(3);
