-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('NEEDS_REPLY', 'NEEDS_ATTENTION', 'CAN_WAIT', 'LOW_PRIORITY');

-- CreateTable
CREATE TABLE "email_classifications" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "category" "EmailCategory" NOT NULL,
    "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_classifications_gmailMessageId_key" ON "email_classifications"("gmailMessageId");
