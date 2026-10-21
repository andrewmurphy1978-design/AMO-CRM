import { requireSection } from "@/lib/permissions";

// Access to this section is set per team member in Settings > Team access.
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  await requireSection("bookings");
  return <>{children}</>;
}
