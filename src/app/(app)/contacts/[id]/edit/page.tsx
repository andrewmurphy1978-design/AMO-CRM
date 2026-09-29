import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { updateContact } from "@/actions/contacts";
import { auth } from "@/lib/auth";
import { getHour12 } from "@/lib/time-format";
import ContactForm from "../../contact-form";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  // One shared client — see src/lib/prisma.ts for why.
  const { contact, allTags, hour12, allContacts, credentialEntries } = await withScopedPrismaClient(async (db) => {
    const contact = await db.contact.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        socialLinks: { orderBy: { createdAt: "asc" } },
        extraAddresses: { orderBy: { order: "asc" } },
        messagingAccounts: { orderBy: { order: "asc" } },
        voipAccounts: { orderBy: { order: "asc" } },
        techStackItems: { orderBy: { order: "asc" } },
        domains: { orderBy: { order: "asc" } },
        relationsFrom: true,
        appSyncSettings: true,
        credentials: { orderBy: { createdAt: "asc" } },
        fieldValues: true,
      },
    });
    const allTags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const hour12 = await getHour12(session, db);
    const allContacts = await db.contact.findMany({
      where: { NOT: { id } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
      select: { id: true, firstName: true, lastName: true, company: true, email: true },
    });
    const credentialEntries = (contact?.credentials ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      url: c.url,
      username: c.username,
      hasPassword: Boolean(c.passwordEncrypted),
      notes: c.notes,
    }));
    return { contact, allTags, hour12, allContacts, credentialEntries };
  });
  if (!contact) notFound();

  const lang = await getLang();
  const t = getDict(lang);
  const boundUpdate = updateContact.bind(null, contact.id);
  const isAdmin = session?.user.role === "ADMIN";

  return (
    <ContactForm
      action={boundUpdate}
      defaultValues={contact}
      submitLabel={t.contactForm.saveChanges}
      lang={lang}
      allTags={allTags}
      currentTags={contact.tags.map((ct) => ct.tag.name)}
      title={t.editContactPage.title}
      hour12={hour12}
      location={t.dashboard.myLocation}
      contactId={contact.id}
      allContacts={allContacts}
      isAdmin={isAdmin}
      credentialEntries={credentialEntries}
    />
  );
}
