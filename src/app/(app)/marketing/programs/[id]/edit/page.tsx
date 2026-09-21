import { notFound } from "next/navigation";
import AffiliateProgramForm from "../../program-form";
import { updateAffiliateProgram } from "@/actions/affiliate-programs";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { withScopedPrismaClient } from "@/lib/prisma";

export default async function EditAffiliateProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const session = await auth();

  const { program, hour12 } = await withScopedPrismaClient(async (db) => {
    const program = await db.affiliateProgram.findUnique({ where: { id } });
    const hour12 = await getHour12(session, db);
    return { program, hour12 };
  });
  if (!program) notFound();

  const boundUpdate = updateAffiliateProgram.bind(null, program.id);

  return (
    <AffiliateProgramForm
      action={boundUpdate}
      defaultValues={program}
      submitLabel={t.marketing.saveProgram}
      title={t.marketing.editProgram}
      lang={lang}
      hour12={hour12}
      dateLocale={dateLocale}
      location={t.dashboard.myLocation}
    />
  );
}
