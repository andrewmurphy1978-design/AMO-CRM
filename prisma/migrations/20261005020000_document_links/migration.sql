-- Link emails, calendar events and calls/texts to a proposal or an invoice.
ALTER TABLE "email_links" ADD COLUMN "proposalId" TEXT, ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "email_links_proposalId_idx" ON "email_links"("proposalId");
CREATE INDEX "email_links_invoiceId_idx" ON "email_links"("invoiceId");
ALTER TABLE "calendar_event_links" ADD COLUMN "proposalId" TEXT, ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "calendar_event_links_proposalId_idx" ON "calendar_event_links"("proposalId");
CREATE INDEX "calendar_event_links_invoiceId_idx" ON "calendar_event_links"("invoiceId");
ALTER TABLE "interactions" ADD COLUMN "proposalId" TEXT, ADD COLUMN "invoiceId" TEXT;
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "interactions_proposalId_idx" ON "interactions"("proposalId");
CREATE INDEX "interactions_invoiceId_idx" ON "interactions"("invoiceId");
