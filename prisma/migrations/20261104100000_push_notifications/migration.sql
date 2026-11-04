CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

CREATE TABLE "push_preferences" (
    "userId" TEXT NOT NULL,
    "disabled" TEXT[] DEFAULT ARRAY[]::TEXT[],
    CONSTRAINT "push_preferences_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "push_notification_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "push_notification_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_notification_log_userId_key_key" ON "push_notification_log"("userId", "key");
CREATE INDEX "push_notification_log_sentAt_idx" ON "push_notification_log"("sentAt");
