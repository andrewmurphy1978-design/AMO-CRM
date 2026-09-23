-- Email list "which address was this delivered to" color-coding table.
CREATE TABLE IF NOT EXISTS "email_address_colors" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_address_colors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_address_colors_address_key" ON "email_address_colors"("address");
