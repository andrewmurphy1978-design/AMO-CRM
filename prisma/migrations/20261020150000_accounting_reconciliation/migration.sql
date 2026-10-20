-- CreateTable
CREATE TABLE "acc_reconciliations" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodEnd" DATE NOT NULL,
    "statementBalance" DOUBLE PRECISION NOT NULL,
    "computedBalance" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acc_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acc_reconciliations_accountId_periodEnd_key" ON "acc_reconciliations"("accountId", "periodEnd");

-- AddForeignKey
ALTER TABLE "acc_reconciliations" ADD CONSTRAINT "acc_reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "acc_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

