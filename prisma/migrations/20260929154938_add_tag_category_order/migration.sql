-- CreateEnum
CREATE TYPE "TagCategory" AS ENUM ('LANGUAGE', 'PERSONAL', 'SYSTEME_IO');

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "category" "TagCategory" NOT NULL DEFAULT 'SYSTEME_IO',
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- Backfill: existing fr/en tags become LANGUAGE (pushed to both apps, same
-- as their current always-on behavior — this just labels what they already
-- were for the new category-based push gating in actions/contacts.ts).
UPDATE "tags" SET "category" = 'LANGUAGE'
WHERE lower("name") IN ('français', 'francais', 'french', 'english', 'anglais');

-- Seed/update the new CRM-only personal tags — upsert by name so this is
-- idempotent whether or not some of these (e.g. "Belle-Famille") already
-- existed from an earlier manual add. Light pastel hex backgrounds; order
-- values leave gaps for future manual reordering from Settings.
INSERT INTO "tags" (id, name, color, category, "order", "createdAt") VALUES
  (gen_random_uuid()::text, 'Amis', '#dbeafe', 'PERSONAL', 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Famille', '#dcfce7', 'PERSONAL', 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Belle-Famille', '#ccfbf1', 'PERSONAL', 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Mikes', '#fef9c3', 'PERSONAL', 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'École', '#ede9fe', 'PERSONAL', 50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Enfants', '#fce7f3', 'PERSONAL', 60, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Clients Comptab-Fisc', '#ffedd5', 'PERSONAL', 70, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Fournisseur', '#e0e7ff', 'PERSONAL', 80, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Gouvernement', '#fee2e2', 'PERSONAL', 90, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "color" = EXCLUDED."color",
  "category" = EXCLUDED."category",
  "order" = EXCLUDED."order";
