import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import AppChrome from "./app-chrome";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  // "Accounting only" accounts (a team member who only gets the Accounting section) are sent there from every
  // other page. Accounting itself lives in its own route group, outside this layout.
  if (session.user.role !== "ADMIN") {
    const only = await withScopedPrismaClient(async (db) => (await db.user.findUnique({ where: { id: session.user.id }, select: { accountingOnly: true, accountingAccess: true } })));
    if (only?.accountingOnly && only.accountingAccess) redirect("/accounting");
  }

  return <AppChrome>{children}</AppChrome>;
}
