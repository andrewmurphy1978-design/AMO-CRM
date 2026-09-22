-- AlterTable
ALTER TABLE "project_phases"
  ADD COLUMN "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
  ADD COLUMN "phaseType" TEXT,
  ADD COLUMN "teamMemberIds" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "description" TEXT;
