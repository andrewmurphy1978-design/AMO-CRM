-- Project types become free text so new ones can be added from the UI.
ALTER TABLE "projects" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "projects" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
ALTER TABLE "projects" ALTER COLUMN "type" SET DEFAULT 'OTHER';
ALTER TABLE "project_type_templates" ALTER COLUMN "type" TYPE TEXT USING "type"::text;
DROP TYPE "ProjectType";

-- CreateTable
CREATE TABLE "custom_project_types" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelFr" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_project_types_pkey" PRIMARY KEY ("key")
);

-- Completed date on projects and phases (tasks already have completedAt).
ALTER TABLE "projects" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "project_phases" ADD COLUMN "completedAt" TIMESTAMP(3);
