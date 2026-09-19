-- CreateTable
CREATE TABLE "email_completions" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_completions_gmailMessageId_key" ON "email_completions"("gmailMessageId");
