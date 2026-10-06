CREATE TABLE "attached_files" (
    "id" TEXT NOT NULL,
    "contactId" TEXT,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "note" TEXT,
    "uploadedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attached_files_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attached_files_contactId_idx" ON "attached_files"("contactId");

CREATE INDEX "attached_files_projectId_idx" ON "attached_files"("projectId");

ALTER TABLE "attached_files" ADD CONSTRAINT "attached_files_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attached_files" ADD CONSTRAINT "attached_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
