import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SystemeIoForm from "./systeme-io-form";
import UserManagement from "./user-management";
import ChangePasswordForm from "./change-password-form";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  // Sequential, not Promise.all — see src/lib/prisma.ts for why.
  const integration = await prisma.integrationSetting.findUnique({
    where: { provider: "systeme_io" },
  });
  const users = isAdmin ? await prisma.user.findMany({ orderBy: { name: "asc" } }) : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-soft">Manage integrations and your team.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column: settings available to everyone. */}
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-sm font-semibold text-ink">Your CRM link</h2>
            <p className="mt-1 text-sm text-soft">
              Bookmark this or share it with your team to get here directly.
            </p>
            <a
              href="https://crm.andrewmurphy.online"
              className="mt-3 inline-block rounded-lg border border-card-border bg-field-bg px-4 py-2 font-mono text-sm text-emerald-700 hover:bg-black/5"
            >
              crm.andrewmurphy.online
            </a>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-sm font-semibold text-ink">Your account</h2>
            <p className="mt-1 text-sm text-soft">Change the password you sign in with.</p>
            <div className="mt-4">
              <ChangePasswordForm />
            </div>
          </section>
        </div>

        {/* Right column: admin-only settings. */}
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-sm font-semibold text-ink">Team</h2>
            {isAdmin && session ? (
              <div className="mt-4">
                <UserManagement users={users} currentUserId={session.user.id} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-soft">Only admins can manage team members.</p>
            )}
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-6 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-sm font-semibold text-ink">systeme.io integration</h2>
            <p className="mt-1 text-sm text-soft">
              Connect your systeme.io account to sync contacts, tags, and custom fields into your CRM.
            </p>
            <div className="mt-4">
              {isAdmin ? (
                <SystemeIoForm
                  connected={Boolean(integration?.apiKeyEncrypted)}
                  lastSyncedAt={integration?.lastSyncedAt?.toISOString() ?? null}
                  lastSyncStatus={integration?.lastSyncStatus ?? null}
                  lastSyncError={integration?.lastSyncError ?? null}
                  autoSyncEnabled={integration?.autoSyncEnabled ?? false}
                />
              ) : (
                <p className="text-sm text-soft">Only admins can manage this integration.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
