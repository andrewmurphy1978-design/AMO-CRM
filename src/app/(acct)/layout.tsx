import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import AppChrome from "@/app/(app)/app-chrome";

// Accounting has its own route group so the main app layout can keep "Accounting only" accounts out of every
// other page; the chrome (sidebar, header) is the same.
export default async function AcctLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  let onlyAccounting = false;
  if (session.user.role !== "ADMIN") {
    const u = await withScopedPrismaClient((db) => db.user.findUnique({ where: { id: session.user.id }, select: { accountingOnly: true, accountingAccess: true } }));
    onlyAccounting = !!(u?.accountingOnly && u.accountingAccess);
  }
  return <AppChrome onlyAccounting={onlyAccounting}>{children}</AppChrome>;
}
