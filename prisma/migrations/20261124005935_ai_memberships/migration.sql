-- CreateEnum
CREATE TYPE "AiMembershipUsage" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'RARELY');

-- CreateTable
CREATE TABLE "ai_memberships" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT,
    "isFree" BOOLEAN NOT NULL DEFAULT false,
    "costUsdMonthly" DOUBLE PRECISION,
    "costCadMonthly" DOUBLE PRECISION,
    "creditsAvailable" DOUBLE PRECISION,
    "creditsPerMonth" DOUBLE PRECISION,
    "rolloverCredits" DOUBLE PRECISION,
    "renewsAt" DATE,
    "usage" "AiMembershipUsage" NOT NULL DEFAULT 'MONTHLY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_memberships_pkey" PRIMARY KEY ("id")
);
