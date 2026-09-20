-- Proposal: cover letter + line-item/tax totals
ALTER TABLE "proposals" ADD COLUMN "coverLetter" TEXT;
ALTER TABLE "proposals" ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "proposals" ADD COLUMN "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "proposals" ADD COLUMN "qstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "proposals" ADD COLUMN "hstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "proposals" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "proposals" ADD COLUMN "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill totalAmount/subtotal from the legacy flat "amount" for existing rows.
UPDATE "proposals" SET "subtotal" = COALESCE("amount", 0), "totalAmount" = COALESCE("amount", 0);

CREATE TABLE "proposal_line_items" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposal_line_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "proposal_line_items_proposalId_idx" ON "proposal_line_items"("proposalId");
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "proposal_line_items_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "proposal_payment_schedule_items" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "dueDate" TIMESTAMP(3),
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "proposal_payment_schedule_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "proposal_payment_schedule_items_proposalId_idx" ON "proposal_payment_schedule_items"("proposalId");
ALTER TABLE "proposal_payment_schedule_items" ADD CONSTRAINT "proposal_payment_schedule_items_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Invoice: link to originating proposal, line-item/tax totals, reminders
ALTER TABLE "invoices" ADD COLUMN "proposalId" TEXT;
ALTER TABLE "invoices" ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "qstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "hstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "invoices" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "invoices" ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "invoices" SET "subtotal" = COALESCE("amount", 0), "totalAmount" = COALESCE("amount", 0);

CREATE INDEX "invoices_proposalId_idx" ON "invoices"("proposalId");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "invoice_line_items"("invoiceId");
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
