-- CreateTable
CREATE TABLE "project_supplier_invoices" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "reimbursable" BOOLEAN NOT NULL DEFAULT true,
    "reimbursementStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "attachToProposal" BOOLEAN NOT NULL DEFAULT true,
    "billedInvoiceId" TEXT,
    "notes" TEXT,
    "fileName" TEXT,
    "fileMime" TEXT,
    "fileData" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_supplier_invoices_projectId_idx" ON "project_supplier_invoices"("projectId");

-- CreateIndex
CREATE INDEX "project_supplier_invoices_billedInvoiceId_idx" ON "project_supplier_invoices"("billedInvoiceId");

-- AddForeignKey
ALTER TABLE "project_supplier_invoices" ADD CONSTRAINT "project_supplier_invoices_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_supplier_invoices" ADD CONSTRAINT "project_supplier_invoices_billedInvoiceId_fkey" FOREIGN KEY ("billedInvoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
