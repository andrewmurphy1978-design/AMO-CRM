import AccessScope from "@/components/access-scope";
import { requireSection } from "@/lib/permissions";

// Access to this section is set per team member in Settings > Team access.
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  const level = await requireSection("sms");
  return <AccessScope level={level}>{children}</AccessScope>;
}
