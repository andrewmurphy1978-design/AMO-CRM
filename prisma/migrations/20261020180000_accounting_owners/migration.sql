-- DropIndex
DROP INDEX "acc_rules_pattern_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accountingAccess" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "acc_entities" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "acc_rules" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "acc_entities_ownerId_idx" ON "acc_entities"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "acc_rules_ownerId_pattern_key" ON "acc_rules"("ownerId", "pattern");

