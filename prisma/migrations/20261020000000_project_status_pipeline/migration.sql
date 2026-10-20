-- The Active stage becomes three statuses: BUILDING / PRESENTING / LAUNCHING.
-- Existing ACTIVE phases are mapped by name; ACTIVE projects start as BUILDING
-- and are then set from the phase currently under way.
ALTER TYPE "ProjectStatus" RENAME TO "ProjectStatus_old";

CREATE TYPE "ProjectStatus" AS ENUM ('PROPOSAL', 'PLANNING', 'BUILDING', 'PRESENTING', 'LAUNCHING', 'FINAL', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

ALTER TABLE "projects" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "project_phases" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "projects" ALTER COLUMN "status" TYPE "ProjectStatus"
  USING (CASE "status"::text WHEN 'ACTIVE' THEN 'BUILDING' ELSE "status"::text END)::"ProjectStatus";

ALTER TABLE "project_phases" ALTER COLUMN "status" TYPE "ProjectStatus"
  USING (CASE
    WHEN "status"::text <> 'ACTIVE' THEN "status"::text
    WHEN "name" ~* 'present|présent' THEN 'PRESENTING'
    WHEN "name" ~* 'deploy|launch|go.?live|lancement|déploi' THEN 'LAUNCHING'
    ELSE 'BUILDING'
  END)::"ProjectStatus";

ALTER TABLE "projects" ALTER COLUMN "status" SET DEFAULT 'PLANNING';
ALTER TABLE "project_phases" ALTER COLUMN "status" SET DEFAULT 'PLANNING';

DROP TYPE "ProjectStatus_old";

-- Former ACTIVE projects: follow the first phase that isn't completed yet.
UPDATE "projects" p SET "status" = (
  CASE
    WHEN ph."name" ~* 'present|présent' THEN 'PRESENTING'
    WHEN ph."name" ~* 'deploy|launch|go.?live|lancement|déploi' THEN 'LAUNCHING'
    ELSE 'BUILDING'
  END
)::"ProjectStatus"
FROM (
  SELECT DISTINCT ON ("projectId") "projectId", "name"
  FROM "project_phases"
  WHERE "status" <> 'COMPLETED'
  ORDER BY "projectId", "order" ASC
) ph
WHERE p."id" = ph."projectId" AND p."status" = 'BUILDING';
