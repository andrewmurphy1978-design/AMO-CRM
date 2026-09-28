-- AlterTable
ALTER TABLE "users" ADD COLUMN     "hiddenHeaderWidgets" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sportsLeague" TEXT,
ADD COLUMN     "sportsTeamMlb" TEXT,
ADD COLUMN     "sportsTeamNhl" TEXT;
