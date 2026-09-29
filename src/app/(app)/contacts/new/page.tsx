import ContactForm from "../contact-form";
import { createContact } from "@/actions/contacts";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { withScopedPrismaClient } from "@/lib/prisma";

export default async function NewContactPage() {
  const lang = await getLang();
  const t = getDict(lang);
  const session = await auth();

  const { allTags, hour12, allContacts } = await withScopedPrismaClient(async (db) => {
    const allTags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const hour12 = await getHour12(session, db);
    const allContacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, company: true, email: true },
    });
    return { allTags, hour12, allContacts };
  });

  return (
    <ContactForm
      action={createContact}
      submitLabel={t.contactForm.createContact}
      lang={lang}
      allTags={allTags}
      title={t.newContactPage.title}
      hour12={hour12}
      location={t.dashboard.myLocation}
      allContacts={allContacts}
    />
  );
}
