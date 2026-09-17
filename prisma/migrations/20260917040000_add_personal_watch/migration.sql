-- CreateTable
CREATE TABLE "personal_watch_people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_watch_people_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_watch_people_name_key" ON "personal_watch_people"("name");

-- CreateTable
CREATE TABLE "personal_watch_emails" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "personal_watch_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_watch_emails_personId_email_key" ON "personal_watch_emails"("personId", "email");

-- AddForeignKey
ALTER TABLE "personal_watch_emails" ADD CONSTRAINT "personal_watch_emails_personId_fkey" FOREIGN KEY ("personId") REFERENCES "personal_watch_people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the fixed roster with the addresses known so far — editable from
-- Settings afterward, never re-seeded.
INSERT INTO "personal_watch_people" ("id", "name", "order") VALUES
    ('pwp_haley', 'Haley', 1),
    ('pwp_lukas', 'Lukas', 2),
    ('pwp_diane', 'Diane', 3),
    ('pwp_me', 'Me', 4);

INSERT INTO "personal_watch_emails" ("id", "personId", "email") VALUES
    ('pwe_haley_1', 'pwp_haley', 'NePasRepondre@csslaurentides.gouv.qc.ca'),
    ('pwe_haley_2', 'pwp_haley', 'laymurphy123450@gmail.com'),
    ('pwe_lukas_1', 'pwp_lukas', 'mgrbazinet@csslaurentides.gouv.qc.ca'),
    ('pwe_diane_1', 'pwp_diane', 'dianemurphy@cgocable.ca');
