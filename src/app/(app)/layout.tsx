import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AppChrome from "./app-chrome";

// Access to each section is checked by that section's own layout (see src/lib/permissions.ts).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  return <AppChrome>{children}</AppChrome>;
}
