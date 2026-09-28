-- AlterTable
ALTER TABLE "users" ADD COLUMN     "marketsCurrency" TEXT,
ADD COLUMN     "marketsItems" TEXT[] DEFAULT ARRAY[]::TEXT[];
