-- AlterTable
ALTER TABLE "affiliate_programs" ADD COLUMN     "email" TEXT,
ADD COLUMN     "extraEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
