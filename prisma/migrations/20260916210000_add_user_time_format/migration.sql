-- CreateEnum
CREATE TYPE "TimeFormat" AS ENUM ('HOUR24', 'HOUR12');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "timeFormat" "TimeFormat" NOT NULL DEFAULT 'HOUR24';
