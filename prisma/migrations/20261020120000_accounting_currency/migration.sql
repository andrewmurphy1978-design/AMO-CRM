-- AlterTable
ALTER TABLE "acc_accounts" ADD COLUMN     "currency" TEXT;

-- AlterTable
ALTER TABLE "acc_transactions" ADD COLUMN     "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 1;

