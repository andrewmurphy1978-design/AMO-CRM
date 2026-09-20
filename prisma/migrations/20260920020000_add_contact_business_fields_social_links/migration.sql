-- Tech stack fields for done-for-you web/funnel/email/store services.
ALTER TABLE "contacts" ADD COLUMN "websiteDomain" TEXT;
ALTER TABLE "contacts" ADD COLUMN "websiteHostingProvider" TEXT;
ALTER TABLE "contacts" ADD COLUMN "websiteDesignApp" TEXT;
ALTER TABLE "contacts" ADD COLUMN "funnelsDomain" TEXT;
ALTER TABLE "contacts" ADD COLUMN "funnelsHostingProvider" TEXT;
ALTER TABLE "contacts" ADD COLUMN "funnelsDesignApp" TEXT;
ALTER TABLE "contacts" ADD COLUMN "emailDomain" TEXT;
ALTER TABLE "contacts" ADD COLUMN "emailHostingProvider" TEXT;
ALTER TABLE "contacts" ADD COLUMN "emailMarketingApp" TEXT;
ALTER TABLE "contacts" ADD COLUMN "storeDomain" TEXT;
ALTER TABLE "contacts" ADD COLUMN "storeHostingProvider" TEXT;
ALTER TABLE "contacts" ADD COLUMN "storeDesignApp" TEXT;

-- Unlimited social profile/page links per contact.
CREATE TABLE "contact_social_links" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_social_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_social_links_contactId_idx" ON "contact_social_links"("contactId");

ALTER TABLE "contact_social_links" ADD CONSTRAINT "contact_social_links_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
