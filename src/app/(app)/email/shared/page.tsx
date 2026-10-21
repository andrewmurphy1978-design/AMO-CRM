import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getLang } from "@/lib/i18n/get-lang";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "../../page-header";
import { listMyMailboxesAction } from "@/actions/shared-mailboxes";
import MailboxMembers from "../../settings/mailbox-members";
import SharedInbox from "./shared-inbox";

export default async function SharedMailboxesPage() {
  const session = await auth();
  const lang = await getLang();
  const boxes = await listMyMailboxesAction();
  const hour12 = await withScopedPrismaClient((db) => getHour12(session, db));
  const fr = lang === "fr";
  const admin = session?.user.role === "ADMIN";
  const { members, access } = admin
    ? await withScopedPrismaClient(async (db) => ({
        members: await db.user.findMany({ where: { role: "MEMBER" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
        access: await db.sharedMailboxAccess.findMany(),
      }))
    : { members: [], access: [] };
  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Boîtes partagées" : "Shared mailboxes"} hour12={hour12} lang={lang} location="" />
      <SharedInbox boxes={boxes} lang={lang} />
      {admin && boxes.length > 0 && (
        <details className="rounded-md border border-card-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-ink">{fr ? "Gérer les accès aux boîtes partagées" : "Manage access to shared mailboxes"}</summary>
          <div className="mt-3 space-y-5">
            {boxes.map((b) => (
              <div key={b.id}>
                <p className="mb-2 text-sm font-semibold text-ink">{b.name} <span className="text-xs font-normal text-soft">{b.address}</span></p>
                <MailboxMembers mailboxId={b.id} members={members} initial={Object.fromEntries(access.filter((a) => a.mailboxId === b.id).map((a) => [a.userId, a.level]))} fr={fr} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
