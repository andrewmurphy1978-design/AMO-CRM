import AffiliateProgramForm from "../program-form";
import { createAffiliateProgram } from "@/actions/affiliate-programs";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { withScopedPrismaClient } from "@/lib/prisma";

export default async function NewAffiliateProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const session = await auth();
  const hour12 = await withScopedPrismaClient((db) => getHour12(session, db));

  return (
    <AffiliateProgramForm
      action={createAffiliateProgram}
      defaultTab={tab}
      submitLabel={t.marketing.createProgram}
      title={t.marketing.newProgram}
      lang={lang}
      hour12={hour12}
      dateLocale={dateLocale}
      location={t.dashboard.myLocation}
    />
  );
}
