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
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-amo-white">Settings</h1>
        <p className="mt-1 text-sm text-amo-muted">Manage integrations and your team.</p>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-amo-border bg-amo-card p-6 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-sm font-semibold text-amo-white">Your CRM link</h2>
        <p className="mt-1 text-sm text-amo-muted">
          Bookmark this or share it with your team to get here directly.
        </p>
        <a
          href="https://crm.andrewmurphy.online"
          className="mt-3 inline-block rounded-lg border border-amo-border bg-white/5 px-4 py-2 font-mono text-sm text-amo-lime hover:bg-white/10"
        >
          crm.andrewmurphy.online
        </a>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-amo-border bg-amo-card p-6 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-sm font-semibold text-amo-white">Your account</h2>
        <p className="mt-1 text-sm text-amo-muted">Change the password you sign in with.</p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-amo-border bg-amo-card p-6 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-sm font-semibold text-amo-white">systeme.io integration</h2>
        <p className="mt-1 text-sm text-amo-muted">
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
            <p className="text-sm text-amo-muted">Only admins can manage this integration.</p>
          )}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-amo-border bg-amo-card p-6 shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-sm font-semibold text-amo-white">Team</h2>
        {isAdmin && session ? (
          <div className="mt-4">
            <UserManagement users={users} currentUserId={session.user.id} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-amo-muted">Only admins can manage team members.</p>
        )}
      </section>
    </div>
  );
}
