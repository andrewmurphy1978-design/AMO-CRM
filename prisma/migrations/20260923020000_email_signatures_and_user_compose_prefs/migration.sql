-- User compose preferences
ALTER TABLE "users" ADD COLUMN "defaultComposeSource" TEXT;
ALTER TABLE "users" ADD COLUMN "defaultFontFamily" TEXT;
ALTER TABLE "users" ADD COLUMN "defaultFontSize" TEXT;

-- EmailSignature
CREATE TABLE "email_signatures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "accounts" TEXT[],
    "useForNew" BOOLEAN NOT NULL DEFAULT false,
    "useForReply" BOOLEAN NOT NULL DEFAULT false,
    "useForForward" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_signatures_pkey" PRIMARY KEY ("id")
);
