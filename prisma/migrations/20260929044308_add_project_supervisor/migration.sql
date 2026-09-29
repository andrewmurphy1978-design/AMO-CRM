-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "supervisorId" TEXT;

-- CreateIndex
CREATE INDEX "projects_supervisorId_idx" ON "projects"("supervisorId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
