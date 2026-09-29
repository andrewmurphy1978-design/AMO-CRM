-- Reassign any contact currently tagged with the old, differently-cased/
-- punctuated systeme.io-era duplicates ("Belle-famille", "Clients Comptab
-- Fisc") onto the new, correctly-cased/colored PERSONAL tags added in
-- 20260929154938_add_tag_category_order, then drop the old duplicates.
INSERT INTO "contact_tags" ("contactId", "tagId", "appliedAt")
SELECT ct."contactId", correct.id, ct."appliedAt"
FROM "contact_tags" ct
JOIN "tags" dup ON dup.id = ct."tagId" AND dup.name IN ('Belle-famille', 'Clients Comptab Fisc')
JOIN "tags" correct ON correct.name = CASE dup.name
  WHEN 'Belle-famille' THEN 'Belle-Famille'
  WHEN 'Clients Comptab Fisc' THEN 'Clients Comptab-Fisc'
END
ON CONFLICT ("contactId", "tagId") DO NOTHING;

DELETE FROM "contact_tags" WHERE "tagId" IN (
  SELECT id FROM "tags" WHERE name IN ('Belle-famille', 'Clients Comptab Fisc')
);

DELETE FROM "tags" WHERE name IN ('Belle-famille', 'Clients Comptab Fisc');

-- New personal tag, displayed last in the PERSONAL group (order 100, after
-- Gouvernement's 90).
INSERT INTO "tags" (id, name, color, category, "order", "createdAt")
VALUES (gen_random_uuid()::text, 'Contact AMO', '#f5d0fe', 'PERSONAL', 100, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "color" = EXCLUDED."color",
  "category" = EXCLUDED."category",
  "order" = EXCLUDED."order";
