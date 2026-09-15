import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateContact } from "@/actions/contacts";
import ContactForm from "../../contact-form";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) notFound();

  const boundUpdate = updateContact.bind(null, contact.id);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-amo-white">Edit contact</h1>
      <div className="mt-6 rounded-lg border border-amo-border bg-amo-card p-6 shadow-sm">
        <ContactForm action={boundUpdate} defaultValues={contact} submitLabel="Save changes" />
      </div>
    </div>
  );
}
