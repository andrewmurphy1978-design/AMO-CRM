import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppChrome from "@/app/(app)/app-chrome";

// Accounting has its own route group but shares the same shell (sidebar, header); its access is checked in
// accounting/layout.tsx.
export default async function AcctLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <AppChrome>{children}</AppChrome>;
}
