-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'FR');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'CA',
ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'EN',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "whatsapp" TEXT;
