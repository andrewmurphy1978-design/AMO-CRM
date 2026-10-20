import type { PrismaClient } from "@/lib/prisma";

// Who may use Accounting: admins always, team members when "Accounting" is turned on in their team account.
// Every user has their own separate books (entities are owned by a user), so a member never sees the admin's.

export interface AccountingUser {
  id: string;
  admin: boolean;
}

export async function accountingUserFor(db: PrismaClient, session: { user: { id: string; role: string } } | null): Promise<AccountingUser | null> {
  if (!session) return null;
  if (session.user.role === "ADMIN") return { id: session.user.id, admin: true };
  const u = await db.user.findUnique({ where: { id: session.user.id }, select: { accountingAccess: true } });
  return u?.accountingAccess ? { id: session.user.id, admin: false } : null;
}
