-- AlterTable
ALTER TABLE "calendar_event_links" ADD COLUMN     "phaseId" TEXT;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

