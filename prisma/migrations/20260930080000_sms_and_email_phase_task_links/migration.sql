-- AlterTable
ALTER TABLE "email_links" ADD COLUMN     "phaseId" TEXT;

-- AlterTable
ALTER TABLE "interactions" ADD COLUMN     "phaseId" TEXT,
ADD COLUMN     "taskId" TEXT;

-- AddForeignKey
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

