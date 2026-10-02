-- Linked projects, per-project apps & subscriptions, payment settings for proposals.
ALTER TABLE "projects" ADD COLUMN "parentProjectId" TEXT;
ALTER TABLE "projects" ADD CONSTRAINT "projects_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "projects_parentProjectId_idx" ON "projects"("parentProjectId");

CREATE TABLE "project_subscriptions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL DEFAULT 'month',
    "note" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_subscriptions_projectId_idx" ON "project_subscriptions"("projectId");
ALTER TABLE "project_subscriptions" ADD CONSTRAINT "project_subscriptions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_settings" ADD COLUMN "interacEmail" TEXT, ADD COLUMN "cardPaymentUrl" TEXT, ADD COLUMN "bookingUrl" TEXT;
