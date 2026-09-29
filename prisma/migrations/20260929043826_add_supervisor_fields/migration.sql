-- AlterTable
ALTER TABLE "project_phases" ADD COLUMN     "supervisorId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "supervisorId" TEXT;

-- CreateIndex
CREATE INDEX "project_phases_supervisorId_idx" ON "project_phases"("supervisorId");

-- CreateIndex
CREATE INDEX "tasks_supervisorId_idx" ON "tasks"("supervisorId");

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
