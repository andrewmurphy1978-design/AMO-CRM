-- AlterTable
ALTER TABLE "acc_accounts" ADD COLUMN     "gifi" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "section" TEXT;

-- AddForeignKey
ALTER TABLE "acc_accounts" ADD CONSTRAINT "acc_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "acc_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

