import ContactForm from "../contact-form";
import { createContact } from "@/actions/contacts";

export default function NewContactPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">New contact</h1>
      <p className="mt-1 text-sm text-slate-500">
        Add a contact manually. Contacts synced from systeme.io appear automatically.
      </p>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <ContactForm action={createContact} submitLabel="Create contact" />
      </div>
    </div>
  );
}
