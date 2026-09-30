import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getGoogleConnection, diagnoseGoogleConnection } from "@/lib/google";
import { getIonosMailbox } from "@/lib/mail/ionos";
import { disconnectGoogleAccount } from "@/actions/integrations";
import GoogleContactsImportForm from "./google-contacts-import-form";
import ContactDataFixesForm from "./contact-data-fixes-form";
import IonosMailboxForm from "./ionos-mailbox-form";
import SystemeIoForm from "./systeme-io-form";
import AnthropicKeyForm from "./anthropic-key-form";
import TwilioForm from "./twilio-form";
import GoogleTasksControls from "./google-tasks-controls";
import { getTwilioConfig, publicBaseUrl } from "@/lib/twilio";
import MakeForm from "./make-form";
import ShortIoForm from "./shortio-form";
import BufferForm, { type BufferAccountStatus, type BufferProvider } from "./buffer-form";
import SocialLinksForm from "./social-links-form";
import type { SocialPlatform } from "@/lib/social";
import UserManagement from "./user-management";
import ChangePasswordForm from "./change-password-form";
import TimeFormatForm from "./time-format-form";
import WorldClockForm from "./world-clock-form";
import PersonalWatchForm from "./personal-watch-form";
import EmailAddressColorForm from "./email-address-color-form";
import EmailScreeningForm from "./email-screening-form";
import ApiKeyVaultForm from "./api-key-vault-form";
import TagsForm from "./tags-form";
import ServicePriceListForm from "./service-price-list-form";
import BillingSettingsForm from "./billing-settings-form";
import EmailComposePreferencesForm from "./email-compose-preferences-form";
import EmailSignaturesForm from "./email-signatures-form";
import BuildVersion from "./build-version";
import SettingsCard, { SettingsGroupLabel } from "./settings-card";
import SettingsTabs from "./settings-tabs";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getWatchedPeople, isPersonalSectionUser } from "@/lib/personal-watch";
import { effectiveWorldClockZones, effectiveHeaderClockZones, effectiveHeaderZoneMobile } from "@/lib/world-clock-zones";
import { effectiveMarketCurrency, effectiveMarketItems, effectiveMarketItemMobile } from "@/lib/dashboard-markets-picks";
import MarketsPicksForm from "./markets-picks-form";
import {
  effectiveSportsLeague,
  effectiveSportsTeamNhl,
  effectiveSportsTeamMlb,
  effectiveSportsTeamNfl,
  effectiveSportsTeamCfl,
  effectiveSportsTeamMls,
  effectiveSportsTeamNba,
  effectiveSportsLeagueMobile,
} from "@/lib/dashboard-sports-picks";
import SportsPicksForm from "./sports-picks-form";
import { effectiveHiddenHeaderWidgets } from "@/lib/dashboard-header-widgets";
import HeaderWidgetsForm from "./header-widgets-form";
import PageHeader from "../page-header";

interface MakeMetadata {
  zone?: string;
  teamId?: string;
}

interface ShortIoMetadata {
  domain?: string;
  domainFr?: string;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; reason?: string }>;
}) {
  const { google: googleStatus, reason: googleErrorReason } = await searchParams;
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const showPersonalCard = isPersonalSectionUser(session?.user.email);
  const lang = await getLang();
  const t = getDict(lang);

  // One shared client for every read below — see the comment on the
  // equivalent block in src/app/(app)/page.tsx for why (each `prisma.x`
  // property access opens a brand-new client/connection, and enough of
  // those in one request risks Cloudflare's Error 1102).
  const {
    currentUser,
    integration,
    makeIntegration,
    anthropicIntegration,
    twilioConfig,
    shortioIntegration,
    bufferSettings,
    socialLinksSetting,
    googleConnection,
    googleProblem,
    googleTasksOn,
    ionosMailbox,
    users,
    watchedPeople,
    emailAddressColors,
    vaultEntries,
    serviceItems,
    billingSettings,
    emailSignatures,
    allTags,
  } = await withScopedPrismaClient(async (db) => {
      const currentUser = session
        ? await db.user.findUnique({
            where: { id: session.user.id },
            select: {
              timeFormat: true,
              emailScreeningInstructions: true,
              defaultComposeSource: true,
              defaultFontFamily: true,
              defaultFontSize: true,
              worldClockZones: true,
              headerClockZones: true,
              headerZoneMobile: true,
              marketsCurrency: true,
              marketsItems: true,
              marketsItemMobile: true,
              sportsLeague: true,
              sportsTeamNhl: true,
              sportsTeamMlb: true,
              sportsTeamNfl: true,
              sportsTeamCfl: true,
              sportsTeamMls: true,
              sportsTeamNba: true,
              sportsLeagueMobile: true,
              hiddenHeaderWidgets: true,
            },
          })
        : null;
      const integration = await db.integrationSetting.findUnique({
        where: { provider: "systeme_io" },
      });
      const makeIntegration = await db.integrationSetting.findUnique({
        where: { provider: "make" },
      });
      const anthropicIntegration = await db.integrationSetting.findUnique({
        where: { provider: "anthropic" },
      });
      const twilioConfig = isAdmin ? await getTwilioConfig(db) : null;
      const shortioIntegration = await db.integrationSetting.findUnique({
        where: { provider: "shortio" },
      });
      const bufferSettings = await db.integrationSetting.findMany({
        where: { provider: { in: ["buffer_en", "buffer_fr", "buffer_fb", "buffer_li"] } },
      });
      const socialLinksSetting = await db.integrationSetting.findUnique({
        where: { provider: "social_links" },
      });
      const googleConnection = session ? await getGoogleConnection(session.user.id, db) : null;
      const googleProblem = session && googleConnection ? await diagnoseGoogleConnection(session.user.id, db) : null;
      const googleTasksOn = session && googleConnection
        ? Boolean((await db.googleAccount.findUnique({ where: { userId: session.user.id }, select: { tasksListId: true } }))?.tasksListId)
        : false;
      const ionosMailbox = session ? await getIonosMailbox(session.user.id, db) : null;
      const users = isAdmin ? await db.user.findMany({ orderBy: { name: "asc" } }) : [];
      const watchedPeople = showPersonalCard ? await getWatchedPeople(db) : [];
      const emailAddressColors = await db.emailAddressColor.findMany({ orderBy: { order: "asc" } });
      // Never select valueEncrypted here — the ciphertext has no reason to
      // reach the client at all until an admin explicitly reveals one entry.
      const vaultEntries = isAdmin
        ? await db.apiKeyVaultEntry.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, label: true, notes: true } })
        : [];
      const serviceItems = isAdmin ? await db.servicePriceListItem.findMany({ orderBy: { name: "asc" } }) : [];
      const billingSettings = isAdmin
        ? await db.billingSettings.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton" } })
        : null;
      const emailSignatures = isAdmin ? await db.emailSignature.findMany({ orderBy: { createdAt: "asc" } }) : [];
      const allTags = isAdmin ? await db.tag.findMany() : [];
      return {
        currentUser,
        integration,
        makeIntegration,
        anthropicIntegration,
        twilioConfig,
        shortioIntegration,
        bufferSettings,
        socialLinksSetting,
        googleConnection,
        googleProblem,
        googleTasksOn,
        ionosMailbox,
        users,
        watchedPeople,
        emailAddressColors,
        vaultEntries,
        serviceItems,
        billingSettings,
        emailSignatures,
        allTags,
      };
    });
  const hour12 = currentUser?.timeFormat === "HOUR12";
  const worldClockZones = effectiveWorldClockZones(currentUser?.worldClockZones ?? []);
  const headerClockZones = effectiveHeaderClockZones(
    currentUser?.headerClockZones ?? [],
    worldClockZones,
  );
  const headerZoneMobile = effectiveHeaderZoneMobile(currentUser?.headerZoneMobile ?? null, headerClockZones);
  const marketsCurrency = effectiveMarketCurrency(currentUser?.marketsCurrency ?? null);
  const marketsItems = effectiveMarketItems(currentUser?.marketsItems ?? []);
  const marketsItemMobile = effectiveMarketItemMobile(currentUser?.marketsItemMobile ?? null, marketsItems);
  const sportsLeague = effectiveSportsLeague(currentUser?.sportsLeague ?? null);
  const sportsTeamNhl = effectiveSportsTeamNhl(currentUser?.sportsTeamNhl ?? null);
  const sportsTeamMlb = effectiveSportsTeamMlb(currentUser?.sportsTeamMlb ?? null);
  const sportsTeamNfl = effectiveSportsTeamNfl(currentUser?.sportsTeamNfl ?? null);
  const sportsTeamCfl = effectiveSportsTeamCfl(currentUser?.sportsTeamCfl ?? null);
  const sportsTeamMls = effectiveSportsTeamMls(currentUser?.sportsTeamMls ?? null);
  const sportsTeamNba = effectiveSportsTeamNba(currentUser?.sportsTeamNba ?? null);
  const sportsLeagueMobile = effectiveSportsLeagueMobile(currentUser?.sportsLeagueMobile ?? null, sportsLeague);
  const hiddenHeaderWidgets = effectiveHiddenHeaderWidgets(currentUser?.hiddenHeaderWidgets ?? []);
  // Set by .github/workflows/deploy.yml right before the Cloudflare build —
  // absent in local dev, where there's no deploy to report. Shown in the
  // "Your CRM link" card as the fastest way to confirm a given push
  // actually went live, short of checking the workflow run itself.
  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA || null;
  const mailAccounts: { source: string; address: string }[] = [
    ...(googleConnection?.email ? [{ source: "gmail", address: googleConnection.email }] : []),
    ...(ionosMailbox ? [{ source: "ionos", address: ionosMailbox.address }] : []),
  ];
  const makeMetadata = (makeIntegration?.metadata as MakeMetadata | null) ?? {};
  const shortioMetadata = (shortioIntegration?.metadata as ShortIoMetadata | null) ?? {};
  const bufferLabels: Record<BufferProvider, string> = {
    buffer_en: t.settings.bufferEnLabel,
    buffer_fr: t.settings.bufferFrLabel,
    buffer_fb: t.settings.bufferFbLabel,
    buffer_li: t.settings.bufferLiLabel,
  };
  const bufferAccounts: BufferAccountStatus[] = (Object.keys(bufferLabels) as BufferProvider[]).map((provider) => {
    const setting = bufferSettings.find((s) => s.provider === provider);
    return {
      provider,
      label: bufferLabels[provider],
      connected: Boolean(setting?.apiKeyEncrypted),
      lastSyncedAt: setting?.lastSyncedAt?.toISOString() ?? null,
      lastSyncStatus: setting?.lastSyncStatus ?? null,
      lastSyncError: setting?.lastSyncError ?? null,
    };
  });
  const socialLinks = (socialLinksSetting?.metadata as Record<string, string> | null) ?? {};
  const socialPlatformNames: Record<SocialPlatform, string> = {
    facebook: t.dashboard.socialFacebook,
    instagram: t.dashboard.socialInstagram,
    linkedin: t.dashboard.socialLinkedin,
    youtube: t.dashboard.socialYoutube,
    tiktok: t.dashboard.socialTiktok,
    x: t.dashboard.socialX,
  };

  // Everything any signed-in user can see and change for themselves —
  // account/password, dashboard personalization, and their own mail
  // connections. The Admin tab (below) never renders any of this, and this
  // tab never renders anything admin-only, so the two stay fully separate
  // regardless of screen size.
  const myTabContent = (
    <div className="space-y-3 sm:space-y-6">
      <SettingsCard title={t.settings.crmLinkTitle} description={t.settings.crmLinkDesc}>
        <a
          href="https://crm.andrewmurphy.online"
          className="mt-3 inline-block rounded-lg border border-card-border bg-field-bg px-4 py-2 font-mono text-sm text-emerald-700 hover:bg-black/5"
        >
          crm.andrewmurphy.online
        </a>
        <BuildVersion
          buildSha={buildSha}
          buildTimeIso={process.env.NEXT_PUBLIC_BUILD_TIME || null}
          lang={lang}
          versionLabel={t.settings.versionLabel}
          localBuildLabel={t.settings.localBuildLabel}
          deployedAtPrefix={t.settings.deployedAtPrefix}
        />
      </SettingsCard>

      <SettingsGroupLabel>{t.settings.groupAccount}</SettingsGroupLabel>
      <SettingsCard title={t.settings.accountTitle} description={t.settings.accountDesc}>
        <ChangePasswordForm lang={lang} />
      </SettingsCard>
      {currentUser && (
        <SettingsCard title={t.settings.timeFormatLabel} description={t.settings.timeFormatDesc}>
          <TimeFormatForm lang={lang} timeFormat={currentUser.timeFormat} />
        </SettingsCard>
      )}

      {currentUser && (
        <>
          <SettingsGroupLabel>{t.settings.groupDashboardWidgets}</SettingsGroupLabel>
          <SettingsCard title={t.settings.worldClockZonesLabel} description={t.settings.worldClockZonesDesc}>
            <WorldClockForm
              lang={lang}
              initialZones={worldClockZones}
              initialHeaderZones={headerClockZones}
              initialHeaderZoneMobile={headerZoneMobile}
            />
          </SettingsCard>
          <SettingsCard title={t.settings.marketsPicksLabel} description={t.settings.marketsPicksDesc}>
            <MarketsPicksForm
              lang={lang}
              initialCurrency={marketsCurrency}
              initialItems={marketsItems}
              initialItemMobile={marketsItemMobile}
            />
          </SettingsCard>
          <SettingsCard title={t.settings.sportsPicksLabel} description={t.settings.sportsPicksDesc}>
            <SportsPicksForm
              lang={lang}
              initialLeague={sportsLeague}
              initialTeamNhl={sportsTeamNhl}
              initialTeamMlb={sportsTeamMlb}
              initialTeamNfl={sportsTeamNfl}
              initialTeamCfl={sportsTeamCfl}
              initialTeamMls={sportsTeamMls}
              initialTeamNba={sportsTeamNba}
              initialLeagueMobile={sportsLeagueMobile}
            />
          </SettingsCard>
          <SettingsCard title={t.settings.headerWidgetsLabel} description={t.settings.headerWidgetsDesc}>
            <HeaderWidgetsForm lang={lang} initialHidden={hiddenHeaderWidgets} />
          </SettingsCard>
        </>
      )}

      <SettingsGroupLabel>{t.settings.groupEmail}</SettingsGroupLabel>
      {currentUser && (
        <SettingsCard title={t.emailComposeSettings.title} description={t.emailComposeSettings.description}>
          <EmailComposePreferencesForm
            lang={lang}
            accounts={mailAccounts}
            defaultComposeSource={currentUser.defaultComposeSource}
            defaultFontFamily={currentUser.defaultFontFamily}
            defaultFontSize={currentUser.defaultFontSize}
          />
        </SettingsCard>
      )}

      <SettingsCard title={t.emailScreeningSettings.title} description={t.emailScreeningSettings.description}>
        <EmailScreeningForm initialInstructions={currentUser?.emailScreeningInstructions ?? ""} lang={lang} />
      </SettingsCard>

      <SettingsCard title={t.settings.googleTitle} description={t.settings.googleDesc}>
        {googleStatus === "error" && (
          <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            {googleErrorReason || "Connection failed."}
          </p>
        )}
        {googleStatus === "connected" && !googleConnection && (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Google said the connection succeeded, but nothing was saved — please try again.
          </p>
        )}
        {googleConnection ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink">
                {t.settings.googleConnectedAs}{" "}
                <span className="font-medium">{googleConnection.email ?? "—"}</span>
              </p>
              <form action={disconnectGoogleAccount}>
                <button
                  type="submit"
                  className="rounded-lg border border-card-border px-3 py-1.5 text-sm text-soft hover:bg-black/5"
                >
                  {t.settings.googleDisconnect}
                </button>
              </form>
            </div>
            {googleProblem && (
              <p className="mt-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">{googleProblem}</p>
            )}
            <p className="mt-2 text-xs text-soft">{t.settings.googleReconnectForSend}</p>
            <GoogleTasksControls enabled={googleTasksOn} />
          </div>
        ) : (
          <a
            href="/api/google/connect"
            className="btn-primary inline-block rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
          >
            {t.settings.googleConnect}
          </a>
        )}
        <GoogleContactsImportForm connected={Boolean(googleConnection)} lang={lang} />
      </SettingsCard>

      <SettingsCard title={t.ionosMailbox.title}>
        <IonosMailboxForm
          connected={Boolean(ionosMailbox)}
          address={ionosMailbox?.address ?? ""}
          displayName={ionosMailbox?.displayName ?? ""}
          lastCheckedAt={ionosMailbox?.lastCheckedAt ?? null}
          lastError={ionosMailbox?.lastError ?? null}
          lang={lang}
        />
      </SettingsCard>

      <SettingsCard title={t.settings.emailAddressColorTitle} description={t.settings.emailAddressColorDesc}>
        <EmailAddressColorForm rows={emailAddressColors} lang={lang} />
      </SettingsCard>

      {showPersonalCard && (
        <>
          <SettingsGroupLabel>{t.personal.settingsTitle}</SettingsGroupLabel>
          <SettingsCard description={t.personal.settingsDescription}>
            <PersonalWatchForm people={watchedPeople} lang={lang} />
          </SettingsCard>
        </>
      )}
    </div>
  );

  // Everything only an admin can see — shared integrations, billing, team
  // management, and org-wide credentials. Rendered only when isAdmin, and
  // only ever reachable through the Admin Settings tab, which itself only
  // exists for admins (see the `tabs` array below) — a non-admin user gets
  // no trace of this content, not even a disabled placeholder.
  const adminTabContent = isAdmin && session ? (
    <div className="space-y-3 sm:space-y-6">
      <SettingsGroupLabel>{t.settings.groupTeamAccess}</SettingsGroupLabel>
      <SettingsCard>
        <UserManagement users={users} currentUserId={session.user.id} lang={lang} />
      </SettingsCard>

      <SettingsGroupLabel>{t.settings.groupBilling}</SettingsGroupLabel>
      {billingSettings && (
        <SettingsCard title={t.billingSettings.title} description={t.billingSettings.description}>
          <BillingSettingsForm
            chargeCanadianTax={billingSettings.chargeCanadianTax}
            gstNumber={billingSettings.gstNumber}
            qstNumber={billingSettings.qstNumber}
            lang={lang}
          />
        </SettingsCard>
      )}
      <SettingsCard>
        <ServicePriceListForm items={serviceItems} lang={lang} />
      </SettingsCard>

      <SettingsGroupLabel>{t.settings.groupIntegrations}</SettingsGroupLabel>
      <SettingsCard title={t.settings.systemeioTitle} description={t.settings.systemeioDesc}>
        <SystemeIoForm
          connected={Boolean(integration?.apiKeyEncrypted)}
          lastSyncedAt={integration?.lastSyncedAt?.toISOString() ?? null}
          lastSyncStatus={integration?.lastSyncStatus ?? null}
          lastSyncError={integration?.lastSyncError ?? null}
          autoSyncEnabled={integration?.autoSyncEnabled ?? false}
          autoSyncTime={integration?.autoSyncTime ?? "03:00"}
          lang={lang}
        />
      </SettingsCard>
      <SettingsCard title={t.settings.makeTitle} description={t.settings.makeDesc}>
        <MakeForm
          connected={Boolean(makeIntegration?.apiKeyEncrypted)}
          zone={makeMetadata.zone ?? "us2.make.com"}
          teamId={makeMetadata.teamId ?? ""}
          lastSyncedAt={makeIntegration?.lastSyncedAt?.toISOString() ?? null}
          lastSyncStatus={makeIntegration?.lastSyncStatus ?? null}
          lastSyncError={makeIntegration?.lastSyncError ?? null}
          lang={lang}
        />
      </SettingsCard>
      <SettingsCard title={t.shortio.title}>
        <ShortIoForm
          connected={Boolean(shortioIntegration?.apiKeyEncrypted)}
          domain={shortioMetadata.domain ?? ""}
          domainFr={shortioMetadata.domainFr ?? ""}
          lang={lang}
        />
      </SettingsCard>
      <SettingsCard title={t.settings.zapierTitle} description={t.settings.zapierDesc}>
        <p className="mt-3 text-sm text-ink">{t.automations.zapierSetupNote}</p>
        <div className="mt-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.automations.webhookUrlLabel}
          </label>
          <code className="mt-1 block rounded-md border border-card-border bg-field-bg px-3 py-2 text-xs text-ink">
            https://crm.andrewmurphy.online/api/webhooks/zapier
          </code>
        </div>
      </SettingsCard>
      <SettingsCard title={t.settings.bufferTitle} description={t.settings.bufferDesc}>
        <BufferForm accounts={bufferAccounts} lang={lang} />
      </SettingsCard>
      <SettingsCard title={t.settings.socialAnalyticsTitle} description={t.settings.socialAnalyticsDesc}>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
          {t.automations.webhookUrlLabel}
        </label>
        <code className="mt-1 block rounded-md border border-card-border bg-field-bg px-3 py-2 text-xs text-ink">
          https://crm.andrewmurphy.online/api/webhooks/social-analytics
        </code>
      </SettingsCard>
      <SettingsCard title={t.settings.socialLinksTitle} description={t.settings.socialLinksDesc}>
        <SocialLinksForm initialLinks={socialLinks} platformNames={socialPlatformNames} lang={lang} />
      </SettingsCard>

      {mailAccounts.length > 0 && (
        <>
          <SettingsGroupLabel>{t.settings.groupSharedEmail}</SettingsGroupLabel>
          <SettingsCard title={t.emailSignatures.title} description={t.emailSignatures.description}>
            <EmailSignaturesForm signatures={emailSignatures} accounts={mailAccounts} lang={lang} />
          </SettingsCard>
        </>
      )}

      <SettingsGroupLabel>{t.settings.groupAiSecurity}</SettingsGroupLabel>
      <SettingsCard title={t.anthropicKey.title} description={t.anthropicKey.description}>
        <AnthropicKeyForm connected={Boolean(anthropicIntegration?.apiKeyEncrypted)} lang={lang} />
      </SettingsCard>
      {isAdmin && (
        <SettingsCard title={t.twilioSettings.title} description={t.twilioSettings.description}>
          <TwilioForm
            connected={Boolean(twilioConfig)}
            accountSid={twilioConfig?.accountSid ?? ""}
            fromNumber={twilioConfig?.fromNumber ?? ""}
            baseUrl={publicBaseUrl() ?? ""}
            lang={lang}
          />
        </SettingsCard>
      )}
      <SettingsCard title={t.apiVault.title} description={t.apiVault.description}>
        <ApiKeyVaultForm entries={vaultEntries} lang={lang} />
      </SettingsCard>

      <SettingsGroupLabel>{t.settings.groupDataTools}</SettingsGroupLabel>
      <SettingsCard title={t.settings.tagsTitle} description={t.settings.tagsDesc}>
        <TagsForm tags={allTags} lang={lang} />
      </SettingsCard>
      <SettingsCard title={t.contactDataFixes.title}>
        <ContactDataFixesForm lang={lang} />
      </SettingsCard>
    </div>
  ) : null;

  const tabs = [
    { id: "user", label: t.settings.tabMySettings, content: myTabContent },
    ...(adminTabContent ? [{ id: "admin", label: t.settings.tabAdminSettings, content: adminTabContent }] : []),
  ];

  return (
    // Mobile: same -mx-4/px-2 inset-cancelling trick as the Dashboard/
    // Marketing/Contact Info pages, plus a tighter vertical rhythm — this
    // page stacks many more cards than most, so the usual sm:space-y-8 felt
    // even longer here.
    <div className="-mx-4 space-y-2 px-2 sm:mx-0 sm:space-y-6 sm:px-0">
      <PageHeader title={t.settings.title} hour12={hour12} lang={lang} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.settings.subtitle}</p>
      <SettingsTabs tabs={tabs} />
    </div>
  );
}
