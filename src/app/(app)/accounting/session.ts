import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { accountingUserFor, type AccountingUser } from "@/lib/accounting/access";

/** The signed-in user if they may use Accounting (admin, or a team member with Accounting turned on); otherwise home. */
export async function requireAccountingUser(): Promise<AccountingUser> {
  const session = await auth();
  const me = await withScopedPrismaClient((db) => accountingUserFor(db, session));
  if (!me) redirect("/");
  return me;
}
