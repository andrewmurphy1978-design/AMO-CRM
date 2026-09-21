-- AlterTable
ALTER TABLE "contacts"
ADD COLUMN "jurisdictionCountry" TEXT,
ADD COLUMN "jurisdictionRegion" TEXT,
ADD COLUMN "preferredCurrency" TEXT,
ADD COLUMN "paymentTerms" TEXT,
ADD COLUMN "paymentSchedule" TEXT,
ADD COLUMN "defaultDiscount" DOUBLE PRECISION;
