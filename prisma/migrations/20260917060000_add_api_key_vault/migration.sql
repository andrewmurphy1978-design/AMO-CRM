-- CreateTable
CREATE TABLE "api_key_vault_entries" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_key_vault_entries_pkey" PRIMARY KEY ("id")
);
