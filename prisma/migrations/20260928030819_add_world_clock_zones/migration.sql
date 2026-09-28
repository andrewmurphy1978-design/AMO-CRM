-- AlterTable
ALTER TABLE "email_signatures" ALTER COLUMN "htmlFr" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "headerClockZones" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "worldClockZones" TEXT[] DEFAULT ARRAY[]::TEXT[];
