-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "systemeIoId" INTEGER NOT NULL,
    "contactId" TEXT,
    "status" TEXT,
    "planName" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT,
    "startedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "systemeIoId" INTEGER NOT NULL,
    "contactId" TEXT,
    "courseName" TEXT,
    "status" TEXT,
    "enrolledAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_memberships" (
    "id" TEXT NOT NULL,
    "systemeIoId" INTEGER NOT NULL,
    "contactId" TEXT,
    "communityName" TEXT,
    "status" TEXT,
    "joinedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_systemeIoId_key" ON "subscriptions"("systemeIoId");

-- CreateIndex
CREATE INDEX "subscriptions_contactId_idx" ON "subscriptions"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "course_enrollments_systemeIoId_key" ON "course_enrollments"("systemeIoId");

-- CreateIndex
CREATE INDEX "course_enrollments_contactId_idx" ON "course_enrollments"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "community_memberships_systemeIoId_key" ON "community_memberships"("systemeIoId");

-- CreateIndex
CREATE INDEX "community_memberships_contactId_idx" ON "community_memberships"("contactId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_memberships" ADD CONSTRAINT "community_memberships_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
