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
      <h1 className="text-2xl font-semibold text-slate-900">Edit contact</h1>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <ContactForm action={boundUpdate} defaultValues={contact} submitLabel="Save changes" />
      </div>
    </div>
  );
}
