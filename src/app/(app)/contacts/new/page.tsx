import ContactForm from "../contact-form";
import { createContact } from "@/actions/contacts";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { withScopedPrismaClient } from "@/lib/prisma";

export default async function NewContactPage() {
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const session = await auth();

  const { allTags, hour12 } = await withScopedPrismaClient(async (db) => {
    const allTags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const hour12 = await getHour12(session, db);
    return { allTags, hour12 };
  });

  return (
    <ContactForm
      action={createContact}
      submitLabel={t.contactForm.createContact}
      lang={lang}
      allTags={allTags}
      title={t.newContactPage.title}
      hour12={hour12}
      dateLocale={dateLocale}
      location={t.dashboard.myLocation}
    />
  );
}
