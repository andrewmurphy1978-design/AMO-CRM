ALTER TABLE "billing_settings" ADD COLUMN "localFilesRoot" TEXT;

ALTER TABLE "contacts" ADD COLUMN "folderPath" TEXT,
ADD COLUMN "folderCreatedAt" TIMESTAMP(3);

ALTER TABLE "projects" ADD COLUMN "folderPath" TEXT,
ADD COLUMN "folderCreatedAt" TIMESTAMP(3);
