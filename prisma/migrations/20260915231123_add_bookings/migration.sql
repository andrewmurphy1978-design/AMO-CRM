-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "systemeIoId" INTEGER NOT NULL,
    "eventName" TEXT,
    "eventType" TEXT,
    "eventDuration" INTEGER,
    "maxParticipants" INTEGER,
    "bookedSlots" INTEGER,
    "contactName" TEXT,
    "status" TEXT,
    "paymentStatus" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_systemeIoId_key" ON "bookings"("systemeIoId");
