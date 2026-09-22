-- Populate "type" from the existing free-text "category" values (closest
-- corresponding value in the fixed per-tab list the Type field now uses)
-- before "category" is dropped — every value below is an exact match on
-- text already on file, never a guess about a program's actual category.
-- Training Programs categories already encoded English/French, so those
-- become "<Type> (English)" / "<Type> (French)" pairs.
UPDATE "affiliate_programs" SET "type" = CASE "category"
  WHEN 'AI Chat Assistants' THEN 'Chat Assistants'
  WHEN 'AI Images & Design' THEN 'Image & Design'
  WHEN 'AI Video Creation' THEN 'Video'
  WHEN 'AI-Powered SEO' THEN 'SEO'
  WHEN 'Audio AI' THEN 'Audio'
  WHEN 'Marketing & Automation' THEN 'Automation'
  WHEN 'Social Media' THEN 'Social Media'
  WHEN 'Writing & Language Tools' THEN 'Writing'
  WHEN 'AI & Business Programs · English' THEN 'AI Training (English)'
  WHEN 'AI & Business Programs · French' THEN 'AI Training (French)'
  WHEN 'Affiliate Marketing · English' THEN 'Affiliate Marketing (English)'
  WHEN 'Affiliate Marketing · French' THEN 'Affiliate Marketing (French)'
  WHEN 'Social Media Programs · English' THEN 'Social Media (English)'
  WHEN 'Social Media Programs · French' THEN 'Social Media (French)'
  WHEN 'Social Media Programs · French / bilingual' THEN 'Social Media (French)'
  WHEN 'Affiliate & Content Business' THEN 'Affiliate Business'
  WHEN 'Affiliate & Content Business · Reselling' THEN 'Affiliate Business'
  WHEN 'Buy / Sell Online Businesses' THEN 'Online Businesses'
  WHEN 'Digital Products' THEN 'Digital products'
  WHEN 'Digital Products · Communities' THEN 'Digital products'
  WHEN 'Digital Products · Creative Assets' THEN 'Digital products'
  WHEN 'Digital Products · Memberships' THEN 'Digital products'
  WHEN 'Dropshipping' THEN 'Drop shipping'
  WHEN 'E-commerce · Dropshipping' THEN 'Drop shipping'
  WHEN 'Freelancing · Agencies' THEN 'Freelancing'
  WHEN 'Print-on-Demand' THEN 'Print-On-Demand'
  WHEN 'Print-on-Demand · Digital Products' THEN 'Print-On-Demand'
  ELSE "type"
END
WHERE "category" IS NOT NULL;

-- AlterTable
ALTER TABLE "affiliate_programs" DROP COLUMN "category";
