import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SystemeIoForm from "./systeme-io-form";
import UserManagement from "./user-management";

export default async function SettingsPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const [integration, users] = await Promise.all([
    prisma.integrationSetting.findUnique({ where: { provider: "systeme_io" } }),
    isAdmin
      ? prisma.user.findMany({ orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage integrations and your team.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">systeme.io integration</h2>
        <p className="mt-1 text-sm text-slate-500">
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
            <p className="text-sm text-slate-500">Only admins can manage this integration.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Team</h2>
        {isAdmin && session ? (
          <div className="mt-4">
            <UserManagement users={users} currentUserId={session.user.id} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Only admins can manage team members.</p>
        )}
      </section>
    </div>
  );
}
