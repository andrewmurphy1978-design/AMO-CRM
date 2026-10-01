-- CreateTable
CREATE TABLE "contact_brand_items" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "note" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_brand_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_brand_items_contactId_category_idx" ON "contact_brand_items"("contactId", "category");

-- AddForeignKey
ALTER TABLE "contact_brand_items" ADD CONSTRAINT "contact_brand_items_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
