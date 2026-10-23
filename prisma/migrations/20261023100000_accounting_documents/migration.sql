CREATE TABLE "acc_documents" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "transactionId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dataBase64" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "emailSource" TEXT,
    "emailKey" TEXT,
    "subject" TEXT,
    "fromLabel" TEXT,
    "vendor" TEXT,
    "docDate" DATE,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "invoiceNumber" TEXT,
    "status" TEXT NOT NULL,
    "matchedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acc_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "acc_documents_ownerId_status_idx" ON "acc_documents"("ownerId", "status");
CREATE INDEX "acc_documents_transactionId_idx" ON "acc_documents"("transactionId");
ALTER TABLE "acc_documents" ADD CONSTRAINT "acc_documents_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "acc_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "acc_scanned_emails" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acc_scanned_emails_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "acc_scanned_emails_ownerId_source_messageKey_key" ON "acc_scanned_emails"("ownerId", "source", "messageKey");
