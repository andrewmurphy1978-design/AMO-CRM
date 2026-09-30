-- AlterTable
ALTER TABLE "google_accounts" ADD COLUMN     "tasksListId" TEXT;

-- CreateTable
CREATE TABLE "google_task_links" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleTaskId" TEXT NOT NULL,
    "googleDeleted" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_task_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_task_links_taskId_key" ON "google_task_links"("taskId");

-- CreateIndex
CREATE INDEX "google_task_links_userId_idx" ON "google_task_links"("userId");

-- AddForeignKey
ALTER TABLE "google_task_links" ADD CONSTRAINT "google_task_links_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_task_links" ADD CONSTRAINT "google_task_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

