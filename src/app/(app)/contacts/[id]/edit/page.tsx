import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateContact } from "@/actions/contacts";
import ContactForm from "../../contact-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });
  if (!contact) notFound();

  const lang = await getLang();
  const t = getDict(lang);
  const allTags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
  const boundUpdate = updateContact.bind(null, contact.id);

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl font-semibold text-ink">{t.editContactPage.title}</h1>
      <div className="mt-6 rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <ContactForm
          action={boundUpdate}
          defaultValues={contact}
          submitLabel={t.contactForm.saveChanges}
          lang={lang}
          allTags={allTags}
          currentTags={contact.tags.map((ct) => ct.tag.name)}
        />
      </div>
    </div>
  );
}
