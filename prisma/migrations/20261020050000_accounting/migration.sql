-- CreateEnum
CREATE TYPE "AccEntityKind" AS ENUM ('PERSONAL', 'SOLE_PROPRIETORSHIP', 'CORPORATION', 'LLC');

-- CreateEnum
CREATE TYPE "AccAccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "acc_entities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AccEntityKind" NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CA',
    "province" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "basis" TEXT NOT NULL DEFAULT 'CASH',
    "salesTaxRegistered" BOOLEAN NOT NULL DEFAULT false,
    "legalName" TEXT,
    "taxNumber" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acc_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_accounts" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameFr" TEXT,
    "type" "AccAccountType" NOT NULL,
    "subtype" TEXT NOT NULL DEFAULT 'OTHER',
    "taxLine" TEXT,
    "deductiblePct" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "institution" TEXT,
    "last4" TEXT,
    "importSign" INTEGER NOT NULL DEFAULT 1,
    "counterEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acc_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_import_batches" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "dupCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acc_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "batchId" TEXT,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "categorizedBy" TEXT,
    "suggestion" JSONB,
    "allocations" JSONB,
    "notes" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "matchedTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acc_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_journal_entries" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acc_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_journal_lines" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "acc_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acc_rules" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acc_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acc_accounts_entityId_idx" ON "acc_accounts"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "acc_accounts_entityId_code_key" ON "acc_accounts"("entityId", "code");

-- CreateIndex
CREATE INDEX "acc_transactions_accountId_date_idx" ON "acc_transactions"("accountId", "date");

-- CreateIndex
CREATE INDEX "acc_transactions_status_idx" ON "acc_transactions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "acc_transactions_accountId_dedupeKey_key" ON "acc_transactions"("accountId", "dedupeKey");

-- CreateIndex
CREATE INDEX "acc_journal_entries_entityId_date_idx" ON "acc_journal_entries"("entityId", "date");

-- CreateIndex
CREATE INDEX "acc_journal_entries_transactionId_idx" ON "acc_journal_entries"("transactionId");

-- CreateIndex
CREATE INDEX "acc_journal_lines_entryId_idx" ON "acc_journal_lines"("entryId");

-- CreateIndex
CREATE INDEX "acc_journal_lines_accountId_idx" ON "acc_journal_lines"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "acc_rules_pattern_key" ON "acc_rules"("pattern");

-- AddForeignKey
ALTER TABLE "acc_accounts" ADD CONSTRAINT "acc_accounts_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "acc_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_import_batches" ADD CONSTRAINT "acc_import_batches_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "acc_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_transactions" ADD CONSTRAINT "acc_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "acc_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_transactions" ADD CONSTRAINT "acc_transactions_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "acc_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_journal_entries" ADD CONSTRAINT "acc_journal_entries_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "acc_entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_journal_entries" ADD CONSTRAINT "acc_journal_entries_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "acc_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_journal_lines" ADD CONSTRAINT "acc_journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "acc_journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acc_journal_lines" ADD CONSTRAINT "acc_journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "acc_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

