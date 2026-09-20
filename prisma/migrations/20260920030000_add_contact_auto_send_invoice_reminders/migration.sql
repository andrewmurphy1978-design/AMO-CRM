-- Per-contact choice of automatic vs. manual-review invoice reminders.
ALTER TABLE "contacts" ADD COLUMN "autoSendInvoiceReminders" BOOLEAN NOT NULL DEFAULT false;
