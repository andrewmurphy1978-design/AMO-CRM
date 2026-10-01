-- AlterEnum
ALTER TYPE "ProjectType" ADD VALUE 'BLOG';
ALTER TYPE "ProjectType" ADD VALUE 'NEWSLETTER';
ALTER TYPE "ProjectType" ADD VALUE 'POST_AUTOMATION';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN "customFields" JSONB;

-- CreateTable
CREATE TABLE "project_type_templates" (
    "type" "ProjectType" NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_type_templates_pkey" PRIMARY KEY ("type")
);
