import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SystemeIoForm from "./systeme-io-form";
import UserManagement from "./user-management";
import ChangePasswordForm from "./change-password-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const lang = await getLang();
  const t = getDict(lang);

  // Sequential, not Promise.all — see src/lib/prisma.ts for why.
  const integration = await prisma.integrationSetting.findUnique({
    where: { provider: "systeme_io" },
  });
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
        </div>
      </div>
    </div>
  );
}
