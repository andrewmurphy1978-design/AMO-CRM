-- CreateTable
CREATE TABLE "email_links" (
    "id" TEXT NOT NULL,
    "gmailThreadId" TEXT NOT NULL,
    "contactId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_event_links" (
    "id" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "contactId" TEXT,
    "projectId" TEXT,
    "taskId" TEXT,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_event_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_links_gmailThreadId_key" ON "email_links"("gmailThreadId");

-- CreateIndex
CREATE INDEX "email_links_contactId_idx" ON "email_links"("contactId");

-- CreateIndex
CREATE INDEX "email_links_projectId_idx" ON "email_links"("projectId");

-- CreateIndex
CREATE INDEX "email_links_taskId_idx" ON "email_links"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_event_links_googleEventId_key" ON "calendar_event_links"("googleEventId");

-- CreateIndex
CREATE INDEX "calendar_event_links_contactId_idx" ON "calendar_event_links"("contactId");

-- CreateIndex
CREATE INDEX "calendar_event_links_projectId_idx" ON "calendar_event_links"("projectId");

-- CreateIndex
CREATE INDEX "calendar_event_links_taskId_idx" ON "calendar_event_links"("taskId");

-- CreateIndex
CREATE INDEX "calendar_event_links_bookingId_idx" ON "calendar_event_links"("bookingId");

-- AddForeignKey
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
