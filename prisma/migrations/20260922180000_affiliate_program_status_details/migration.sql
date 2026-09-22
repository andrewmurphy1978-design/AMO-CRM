-- AlterTable
ALTER TABLE "affiliate_programs" ADD COLUMN "statusDetails" TEXT;

-- Remap the free-text "affiliateStatus" values used so far into the fixed
-- set of 8 statuses the CRM now enforces, moving any nuance the old text
-- carried (which platform, why declined/blocked, etc.) into the new
-- "statusDetails" column instead of discarding it.
UPDATE "affiliate_programs" SET
  "statusDetails" = CASE "affiliateStatus"
    WHEN 'Fallback active — apply via Impact' THEN 'Apply via Impact'
    WHEN 'Pending clarification' THEN 'Pending clarification from provider'
    WHEN 'Fallback active — apply directly' THEN 'Apply directly'
    WHEN 'Fallback active — Impact access needed' THEN 'Impact access needed'
    WHEN 'Fallback active — apply via Knowledge Business Affiliate Club' THEN 'Apply via Knowledge Business Affiliate Club'
    WHEN 'Declined - Impact.com auto-rejected (did not meet application criteria)' THEN 'Impact.com auto-rejected — did not meet application criteria'
    WHEN 'Pending PartnerStack Network approval' THEN 'PartnerStack Network approval'
    WHEN 'Application route not identified' THEN 'Route not yet identified'
    WHEN 'Available - 20% recurring via PartnerStack, 90-day cookie' THEN '20% recurring via PartnerStack, 90-day cookie'
    WHEN 'Ineligible — follower requirement' THEN 'Ineligible — follower requirement not met'
    WHEN 'Ineligible - requires paid account (free tier not eligible)' THEN 'Requires paid account — free tier not eligible'
    WHEN 'Blocked — PartnerStack Network approval' THEN 'PartnerStack Network approval blocked'
    WHEN 'Declined - PartnerStack' THEN 'PartnerStack'
    WHEN 'Provider-specific — cannot apply yet' THEN 'Provider-specific — cannot apply yet'
    WHEN 'Fallback — Declined (PartnerStack)' THEN 'PartnerStack'
    WHEN 'Pending Impact availability' THEN 'Impact availability pending'
    WHEN 'Application submitted - pending approval' THEN 'Application submitted'
    WHEN 'Declined - Zapier Solution Partner application not accepted' THEN 'Zapier Solution Partner application not accepted'
    WHEN 'Partner/referral program to verify' THEN 'Partner/referral program to verify'
    ELSE NULL
  END,
  "affiliateStatus" = CASE "affiliateStatus"
    WHEN 'Apply / verify' THEN 'Apply / verify'
    WHEN 'Fallback active' THEN 'Fallback active - no affiliate program'
    WHEN 'Pending approval' THEN 'Pending approval'
    WHEN 'Fallback active / No public affiliate program' THEN 'Fallback active - no affiliate program'
    WHEN 'Link acquired' THEN 'Link acquired'
    WHEN 'Approved - affiliate link live' THEN 'Approved - affiliate link active'
    WHEN 'Fallback active — apply via Impact' THEN 'Fallback active - no affiliate program'
    WHEN 'Fallback active — no affiliate program identified' THEN 'Fallback active - no affiliate program'
    WHEN 'Pending clarification' THEN 'Apply / verify'
    WHEN 'Fallback active — apply directly' THEN 'Fallback active - no affiliate program'
    WHEN 'Fallback active — Impact access needed' THEN 'Fallback active - no affiliate program'
    WHEN 'Fallback active — apply via Knowledge Business Affiliate Club' THEN 'Fallback active - no affiliate program'
    WHEN 'Affiliate link active' THEN 'Approved - affiliate link active'
    WHEN 'Declined - Impact.com auto-rejected (did not meet application criteria)' THEN 'Fallback active - Declined'
    WHEN 'Pending PartnerStack Network approval' THEN 'Pending approval'
    WHEN 'Fallback active — no separate public program' THEN 'Fallback active - no affiliate program'
    WHEN 'Application route not identified' THEN 'Application route to verify'
    WHEN 'Available - 20% recurring via PartnerStack, 90-day cookie' THEN 'Approved - affiliate link active'
    WHEN 'Ineligible — follower requirement' THEN 'Fallback active - Declined'
    WHEN 'Ineligible - requires paid account (free tier not eligible)' THEN 'Fallback active - Declined'
    WHEN 'Blocked — PartnerStack Network approval' THEN 'Fallback active - Blocked'
    WHEN 'Application route to verify' THEN 'Application route to verify'
    WHEN 'Declined - PartnerStack' THEN 'Fallback active - Declined'
    WHEN 'Provider-specific — cannot apply yet' THEN 'Application route to verify'
    WHEN 'Fallback active — no affiliate offer' THEN 'Fallback active - no affiliate program'
    WHEN 'Fallback — Declined (PartnerStack)' THEN 'Fallback active - Declined'
    WHEN 'Pending Impact availability' THEN 'Pending approval'
    WHEN 'Application submitted - pending approval' THEN 'Pending approval'
    WHEN 'Declined - Zapier Solution Partner application not accepted' THEN 'Fallback active - Declined'
    WHEN 'Partner/referral program to verify' THEN 'Application route to verify'
    ELSE "affiliateStatus"
  END
WHERE "affiliateStatus" IS NOT NULL;
