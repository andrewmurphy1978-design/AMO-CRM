import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGoogleConnection } from "@/lib/google";
import { disconnectGoogleAccount } from "@/actions/integrations";
import SystemeIoForm from "./systeme-io-form";
import MakeForm from "./make-form";
import BufferForm, { type BufferAccountStatus, type BufferProvider } from "./buffer-form";
import UserManagement from "./user-management";
import ChangePasswordForm from "./change-password-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

interface MakeMetadata {
  zone?: string;
  teamId?: string;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; reason?: string }>;
}) {
  const { google: googleStatus, reason: googleErrorReason } = await searchParams;
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const lang = await getLang();
  const t = getDict(lang);

  // Sequential, not Promise.all — see src/lib/prisma.ts for why.
  const integration = await prisma.integrationSetting.findUnique({
    where: { provider: "systeme_io" },
  });
  const makeIntegration = await prisma.integrationSetting.findUnique({
    where: { provider: "make" },
  });
  const makeMetadata = (makeIntegration?.metadata as MakeMetadata | null) ?? {};
  const bufferSettings = await prisma.integrationSetting.findMany({
    where: { provider: { in: ["buffer_en", "buffer_fr", "buffer_fb", "buffer_li"] } },
  });
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
  const googleConnection = session ? await getGoogleConnection(session.user.id) : null;
  const users = isAdmin ? await prisma.user.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">{t.settings.title}</h1>
        <p className="mt-1 text-sm text-soft">{t.settings.subtitle}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: settings available to everyone. */}
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.settings.crmLinkTitle}</h2>
            <p className="mt-1 text-sm text-soft">{t.settings.crmLinkDesc}</p>
            <a
              href="https://crm.andrewmurphy.online"
              className="mt-3 inline-block rounded-lg border border-card-border bg-field-bg px-4 py-2 font-mono text-sm text-emerald-700 hover:bg-black/5"
            >
              crm.andrewmurphy.online
            </a>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.settings.accountTitle}</h2>
            <p className="mt-1 text-sm text-soft">{t.settings.accountDesc}</p>
            <div className="mt-4">
              <ChangePasswordForm lang={lang} />
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.settings.googleTitle}</h2>
            <p className="mt-1 text-sm text-soft">{t.settings.googleDesc}</p>
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
            <div className="mt-4">
              {googleConnection ? (
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
              ) : (
                <a
                  href="/api/google/connect"
                  className="btn-primary inline-block rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
                >
                  {t.settings.googleConnect}
                </a>
              )}
            </div>
          </section>
        </div>

        {/* Right column: admin-only settings. */}
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            {isAdmin && session ? (
              <UserManagement users={users} currentUserId={session.user.id} lang={lang} />
            ) : (
              <>
                <h2 className="font-display text-lg font-semibold text-ink">{t.settings.teamTitle}</h2>
                <p className="mt-2 text-sm text-soft">{t.settings.teamAdminOnly}</p>
              </>
            )}
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.settings.systemeioTitle}</h2>
            <p className="mt-1 text-sm text-soft">{t.settings.systemeioDesc}</p>
            <div className="mt-4">
              {isAdmin ? (
                <SystemeIoForm
                  connected={Boolean(integration?.apiKeyEncrypted)}
                  lastSyncedAt={integration?.lastSyncedAt?.toISOString() ?? null}
                  lastSyncStatus={integration?.lastSyncStatus ?? null}
                  lastSyncError={integration?.lastSyncError ?? null}
                  autoSyncEnabled={integration?.autoSyncEnabled ?? false}
                  autoSyncTime={integration?.autoSyncTime ?? "03:00"}
                  lang={lang}
                />
              ) : (
                <p className="text-sm text-soft">{t.settings.systemeioAdminOnly}</p>
              )}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.settings.makeTitle}</h2>
            <p className="mt-1 text-sm text-soft">{t.settings.makeDesc}</p>
            <div className="mt-4">
              {isAdmin ? (
                <MakeForm
                  connected={Boolean(makeIntegration?.apiKeyEncrypted)}
                  zone={makeMetadata.zone ?? "us2.make.com"}
                  teamId={makeMetadata.teamId ?? ""}
                  lastSyncedAt={makeIntegration?.lastSyncedAt?.toISOString() ?? null}
                  lastSyncStatus={makeIntegration?.lastSyncStatus ?? null}
                  lastSyncError={makeIntegration?.lastSyncError ?? null}
                  lang={lang}
                />
              ) : (
                <p className="text-sm text-soft">{t.settings.systemeioAdminOnly}</p>
              )}
            </div>
          </section>

          {isAdmin && (
            <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
              <h2 className="font-display text-lg font-semibold text-ink">{t.settings.zapierTitle}</h2>
              <p className="mt-1 text-sm text-soft">{t.settings.zapierDesc}</p>
              <p className="mt-3 text-sm text-ink">{t.automations.zapierSetupNote}</p>
              <div className="mt-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
                  {t.automations.webhookUrlLabel}
                </label>
                <code className="mt-1 block rounded-md border border-card-border bg-field-bg px-3 py-2 text-xs text-ink">
                  https://crm.andrewmurphy.online/api/webhooks/zapier
                </code>
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
              <h2 className="font-display text-lg font-semibold text-ink">{t.settings.bufferTitle}</h2>
              <p className="mt-1 text-sm text-soft">{t.settings.bufferDesc}</p>
              <div className="mt-4">
                <BufferForm accounts={bufferAccounts} lang={lang} />
              </div>
            </section>
          )}

          {isAdmin && (
            <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
              <h2 className="font-display text-lg font-semibold text-ink">{t.settings.socialAnalyticsTitle}</h2>
              <p className="mt-1 text-sm text-soft">{t.settings.socialAnalyticsDesc}</p>
              <div className="mt-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
                  {t.automations.webhookUrlLabel}
                </label>
                <code className="mt-1 block rounded-md border border-card-border bg-field-bg px-3 py-2 text-xs text-ink">
                  https://crm.andrewmurphy.online/api/webhooks/social-analytics
                </code>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
