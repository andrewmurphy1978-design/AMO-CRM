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
import StripeForm from "./stripe-form";
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
import { loadTypeInfo } from "@/lib/project-type-store";
import BillingSettingsForm from "./billing-settings-form";
import EmailComposePreferencesForm from "./email-compose-preferences-form";
import EmailSignaturesForm from "./email-signatures-form";
import BuildVersion from "./build-version";
import LocalFilesForm from "./local-files-form";
import SettingsLayout, { type SettingsSectionDef } from "./settings-layout";
import SettingsIcon from "../settings-icon";
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
import type { ExpiryInfo } from "@/lib/api-key-expiry-shared";

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
    stripeIntegration,
    twilioConfig,
    twilioIntegration,
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
      const stripeIntegration = isAdmin ? await db.integrationSetting.findUnique({ where: { provider: "stripe" } }) : null;
      const twilioConfig = isAdmin ? await getTwilioConfig(db) : null;
      const twilioIntegration = isAdmin ? await db.integrationSetting.findUnique({ where: { provider: "twilio" } }) : null;
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
        ? await db.apiKeyVaultEntry.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, label: true, notes: true, expiresAt: true, noExpiry: true, source: true } })
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
        stripeIntegration,
        twilioConfig,
        twilioIntegration,
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
  // The expiry date asked when the key was pasted (shown under each key field).
  const expiryOf = (row: { apiKeyExpiresAt: Date | null; apiKeyNoExpiry: boolean } | null | undefined): ExpiryInfo =>
    row && (row.apiKeyExpiresAt || row.apiKeyNoExpiry) ? { expiresAt: row.apiKeyExpiresAt?.toISOString() ?? null, noExpiry: row.apiKeyNoExpiry } : null;
  const bufferAccounts: BufferAccountStatus[] = (Object.keys(bufferLabels) as BufferProvider[]).map((provider) => {
    const setting = bufferSettings.find((s) => s.provider === provider);
    return {
      provider,
      label: bufferLabels[provider],
      connected: Boolean(setting?.apiKeyEncrypted),
      lastSyncedAt: setting?.lastSyncedAt?.toISOString() ?? null,
      lastSyncStatus: setting?.lastSyncStatus ?? null,
      lastSyncError: setting?.lastSyncError ?? null,
      expiry: expiryOf(setting),
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

  // The left-hand menu of the Settings screen: every section is one entry (grouped), shown one at a time.
  // "user" sections are what any signed-in user can see and change for themselves (account, dashboard
  // personalization, their own mail connections); "admin" sections (shared integrations, billing, team
  // management, org-wide credentials) are only added when isAdmin — a non-admin user gets no trace of them.
  const sections: SettingsSectionDef[] = [];
  const addSection = (s: SettingsSectionDef) => sections.push(s);
  const fr = lang === "fr";

  addSection({
    id: "crm-link", scope: "user", group: t.settings.groupAccount, icon: "link", label: t.settings.crmLinkTitle, description: t.settings.crmLinkDesc,
    content: (
      <>
        <a
          href="https://crm.andrewmurphy.online"
          className="inline-block rounded-lg border border-card-border bg-field-bg px-4 py-2 font-mono text-sm text-emerald-700 hover:bg-black/5"
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
      </>
    ),
  });
  addSection({
    id: "account", scope: "user", group: t.settings.groupAccount, icon: "user", label: t.settings.accountTitle, description: t.settings.accountDesc,
    content: <ChangePasswordForm lang={lang} />,
  });
  if (currentUser) {
    addSection({
      id: "time-format", scope: "user", group: t.settings.groupAccount, icon: "clock", label: t.settings.timeFormatLabel, description: t.settings.timeFormatDesc,
      content: <TimeFormatForm lang={lang} timeFormat={currentUser.timeFormat} />,
    });
    addSection({
      id: "world-clock", scope: "user", group: t.settings.groupDashboardWidgets, icon: "globe", label: t.settings.worldClockZonesLabel, description: t.settings.worldClockZonesDesc,
      content: (
        <WorldClockForm
          lang={lang}
          initialZones={worldClockZones}
          initialHeaderZones={headerClockZones}
          initialHeaderZoneMobile={headerZoneMobile}
        />
      ),
    });
    addSection({
      id: "markets", scope: "user", group: t.settings.groupDashboardWidgets, icon: "chart", label: t.settings.marketsPicksLabel, description: t.settings.marketsPicksDesc,
      content: (
        <MarketsPicksForm
          lang={lang}
          initialCurrency={marketsCurrency}
          initialItems={marketsItems}
          initialItemMobile={marketsItemMobile}
        />
      ),
    });
    addSection({
      id: "sports", scope: "user", group: t.settings.groupDashboardWidgets, icon: "sparkles", label: t.settings.sportsPicksLabel, description: t.settings.sportsPicksDesc,
      content: (
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
      ),
    });
    addSection({
      id: "header-widgets", scope: "user", group: t.settings.groupDashboardWidgets, icon: "squares", label: t.settings.headerWidgetsLabel, description: t.settings.headerWidgetsDesc,
      content: <HeaderWidgetsForm lang={lang} initialHidden={hiddenHeaderWidgets} />,
    });
    addSection({
      id: "email-compose", scope: "user", group: t.settings.groupEmail, icon: "envelope", label: t.emailComposeSettings.title, description: t.emailComposeSettings.description,
      content: (
        <EmailComposePreferencesForm
          lang={lang}
          accounts={mailAccounts}
          defaultComposeSource={currentUser.defaultComposeSource}
          defaultFontFamily={currentUser.defaultFontFamily}
          defaultFontSize={currentUser.defaultFontSize}
        />
      ),
    });
  }
  addSection({
    id: "email-screening", scope: "user", group: t.settings.groupEmail, icon: "shield", label: t.emailScreeningSettings.title, description: t.emailScreeningSettings.description,
    content: <EmailScreeningForm initialInstructions={currentUser?.emailScreeningInstructions ?? ""} lang={lang} />,
  });
  addSection({
    id: "google", scope: "user", group: t.settings.groupEmail, icon: "globe", label: t.settings.googleTitle, description: t.settings.googleDesc,
    content: (
      <>
        {googleStatus === "error" && (
          <p className="mb-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            {googleErrorReason || "Connection failed."}
          </p>
        )}
        {googleStatus === "connected" && !googleConnection && (
          <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
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
      </>
    ),
  });
  addSection({
    id: "ionos", scope: "user", group: t.settings.groupEmail, icon: "envelope", label: t.ionosMailbox.title,
    content: (
      <IonosMailboxForm
        connected={Boolean(ionosMailbox)}
        address={ionosMailbox?.address ?? ""}
        displayName={ionosMailbox?.displayName ?? ""}
        lastCheckedAt={ionosMailbox?.lastCheckedAt ?? null}
        lastError={ionosMailbox?.lastError ?? null}
        lang={lang}
      />
    ),
  });
  addSection({
    id: "email-colors", scope: "user", group: t.settings.groupEmail, icon: "palette", label: t.settings.emailAddressColorTitle, description: t.settings.emailAddressColorDesc,
    content: <EmailAddressColorForm rows={emailAddressColors} lang={lang} />,
  });
  if (showPersonalCard) {
    addSection({
      id: "personal", scope: "user", group: t.personal.settingsTitle, icon: "eye", label: t.personal.settingsTitle, description: t.personal.settingsDescription,
      content: <PersonalWatchForm people={watchedPeople} lang={lang} />,
    });
  }

  if (isAdmin && session) {
    addSection({
      id: "team", scope: "admin", group: t.settings.groupTeamAccess, icon: "users", label: t.settings.groupTeamAccess,
      content: <UserManagement users={users} currentUserId={session.user.id} lang={lang} />,
    });
    if (billingSettings) {
      addSection({
        id: "billing", scope: "admin", group: t.settings.groupBilling, icon: "card", label: t.billingSettings.title, description: t.billingSettings.description,
        content: (
          <BillingSettingsForm
            chargeCanadianTax={billingSettings.chargeCanadianTax}
            gstNumber={billingSettings.gstNumber}
            qstNumber={billingSettings.qstNumber}
            interacEmail={billingSettings.interacEmail}
            cardPaymentUrl={billingSettings.cardPaymentUrl}
            bookingUrl={billingSettings.bookingUrl}
            lang={lang}
          />
        ),
      });
    }
    addSection({
      id: "local-files", scope: "admin", group: t.settings.groupBilling, icon: "folder", label: fr ? "Fichiers locaux" : "Local files",
      description: fr ? "Où sont rangés les dossiers de vos clients et projets sur votre ordinateur." : "Where your client and project folders are kept on your computer.",
      content: <LocalFilesForm root={billingSettings?.localFilesRoot ?? null} lang={lang} />,
    });
    addSection({
      id: "price-list", scope: "admin", group: t.settings.groupBilling, icon: "tag", label: t.servicePriceList.title,
      content: <ServicePriceListForm items={serviceItems} lang={lang} customTypes={(await loadTypeInfo(lang)).custom.map((c) => ({ key: c.key, label: lang === "fr" && c.labelFr ? c.labelFr : c.label }))} />,
    });

    addSection({
      id: "systeme-io", scope: "admin", group: t.settings.groupIntegrations, icon: "bolt", label: t.settings.systemeioTitle, description: t.settings.systemeioDesc,
      content: (
        <SystemeIoForm
          connected={Boolean(integration?.apiKeyEncrypted)}
          expiry={expiryOf(integration)}
          lastSyncedAt={integration?.lastSyncedAt?.toISOString() ?? null}
          lastSyncStatus={integration?.lastSyncStatus ?? null}
          lastSyncError={integration?.lastSyncError ?? null}
          autoSyncEnabled={integration?.autoSyncEnabled ?? false}
          autoSyncTime={integration?.autoSyncTime ?? "03:00"}
          lang={lang}
        />
      ),
    });
    addSection({
      id: "make", scope: "admin", group: t.settings.groupIntegrations, icon: "bolt", label: t.settings.makeTitle, description: t.settings.makeDesc,
      content: (
        <MakeForm
          connected={Boolean(makeIntegration?.apiKeyEncrypted)}
          expiry={expiryOf(makeIntegration)}
          zone={makeMetadata.zone ?? "us2.make.com"}
          teamId={makeMetadata.teamId ?? ""}
          lastSyncedAt={makeIntegration?.lastSyncedAt?.toISOString() ?? null}
          lastSyncStatus={makeIntegration?.lastSyncStatus ?? null}
          lastSyncError={makeIntegration?.lastSyncError ?? null}
          lang={lang}
        />
      ),
    });
    addSection({
      id: "shortio", scope: "admin", group: t.settings.groupIntegrations, icon: "link", label: t.shortio.title,
      content: (
        <ShortIoForm
          connected={Boolean(shortioIntegration?.apiKeyEncrypted)}
          expiry={expiryOf(shortioIntegration)}
          domain={shortioMetadata.domain ?? ""}
          domainFr={shortioMetadata.domainFr ?? ""}
          lang={lang}
        />
      ),
    });
    addSection({
      id: "zapier", scope: "admin", group: t.settings.groupIntegrations, icon: "bolt", label: t.settings.zapierTitle, description: t.settings.zapierDesc,
      content: (
        <>
          <p className="text-sm text-ink">{t.automations.zapierSetupNote}</p>
          <div className="mt-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
              {t.automations.webhookUrlLabel}
            </label>
            <code className="mt-1 block rounded-md border border-card-border bg-field-bg px-3 py-2 text-xs text-ink">
              https://crm.andrewmurphy.online/api/webhooks/zapier
            </code>
          </div>
        </>
      ),
    });
    addSection({
      id: "buffer", scope: "admin", group: t.settings.groupIntegrations, icon: "chart", label: t.settings.bufferTitle, description: t.settings.bufferDesc,
      content: <BufferForm accounts={bufferAccounts} lang={lang} />,
    });
    addSection({
      id: "social-analytics", scope: "admin", group: t.settings.groupIntegrations, icon: "chart", label: t.settings.socialAnalyticsTitle, description: t.settings.socialAnalyticsDesc,
      content: (
        <>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.automations.webhookUrlLabel}
          </label>
          <code className="mt-1 block rounded-md border border-card-border bg-field-bg px-3 py-2 text-xs text-ink">
            https://crm.andrewmurphy.online/api/webhooks/social-analytics
          </code>
        </>
      ),
    });
    addSection({
      id: "social-links", scope: "admin", group: t.settings.groupIntegrations, icon: "link", label: t.settings.socialLinksTitle, description: t.settings.socialLinksDesc,
      content: <SocialLinksForm initialLinks={socialLinks} platformNames={socialPlatformNames} lang={lang} />,
    });
    if (mailAccounts.length > 0) {
      addSection({
        id: "signatures", scope: "admin", group: t.settings.groupSharedEmail, icon: "envelope", label: t.emailSignatures.title, description: t.emailSignatures.description,
        content: <EmailSignaturesForm signatures={emailSignatures} accounts={mailAccounts} lang={lang} />,
      });
    }

    addSection({
      id: "anthropic", scope: "admin", group: t.settings.groupAiSecurity, icon: "sparkles", label: t.anthropicKey.title, description: t.anthropicKey.description,
      content: <AnthropicKeyForm connected={Boolean(anthropicIntegration?.apiKeyEncrypted)} expiry={expiryOf(anthropicIntegration)} lang={lang} />,
    });
    addSection({
      id: "stripe", scope: "admin", group: t.settings.groupAiSecurity, icon: "card", label: fr ? "Paiements par carte (Stripe)" : "Card payments (Stripe)",
      description: fr ? "Page de paiement pour les versements : le client paie par carte et la facture est marquée payée automatiquement." : "A payment page for the instalments: the client pays by card and the invoice is marked paid automatically.",
      content: (
        <StripeForm
          connected={Boolean(stripeIntegration?.apiKeyEncrypted)}
          expiry={expiryOf(stripeIntegration)}
          webhookSet={Boolean((stripeIntegration?.metadata as { webhookSecretEnc?: string } | null)?.webhookSecretEnc)}
          webhookUrl={`${publicBaseUrl() ?? "https://your-crm-address"}/api/stripe/webhook`}
          lang={lang}
        />
      ),
    });
    addSection({
      id: "twilio", scope: "admin", group: t.settings.groupAiSecurity, icon: "phone", label: t.twilioSettings.title, description: t.twilioSettings.description,
      content: (
        <TwilioForm
          connected={Boolean(twilioConfig)}
          expiry={expiryOf(twilioIntegration)}
          accountSid={twilioConfig?.accountSid ?? ""}
          fromNumber={twilioConfig?.fromNumber ?? ""}
          baseUrl={publicBaseUrl() ?? ""}
          lang={lang}
        />
      ),
    });
    addSection({
      id: "api-vault", scope: "admin", group: t.settings.groupAiSecurity, icon: "key", label: t.apiVault.title, description: t.apiVault.description,
      content: <ApiKeyVaultForm entries={vaultEntries.map((e) => ({ id: e.id, label: e.label, notes: e.notes, source: e.source, expiresAt: e.expiresAt?.toISOString() ?? null, noExpiry: e.noExpiry }))} lang={lang} />,
    });

    addSection({
      id: "tags", scope: "admin", group: t.settings.groupDataTools, icon: "tag", label: t.settings.tagsTitle, description: t.settings.tagsDesc,
      content: <TagsForm tags={allTags} lang={lang} />,
    });
    addSection({
      id: "data-fixes", scope: "admin", group: t.settings.groupDataTools, icon: "wrench", label: t.contactDataFixes.title,
      content: <ContactDataFixesForm lang={lang} />,
    });
  }

  return (
    // Mobile: same -mx-4/px-2 inset-cancelling trick as the Dashboard/
    // Marketing/Contact Info pages, plus a tighter vertical rhythm.
    <div className="space-y-2 sm:space-y-6">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <SettingsIcon />
            <span className="truncate">{t.settings.title}</span>
          </span>
        }
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
      />
      <SettingsLayout
        sections={sections}
        labels={{ mine: t.settings.tabMySettings, admin: t.settings.tabAdminSettings, search: t.settings.menuSearch, noMatch: t.settings.menuNoMatch, menu: t.settings.menuLabel }}
      />
    </div>
  );
}
