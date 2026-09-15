import ContactForm from "../contact-form";
import { createContact } from "@/actions/contacts";

export default function NewContactPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-amo-white">New contact</h1>
      <p className="mt-1 text-sm text-amo-muted">
        Add a contact manually. Contacts synced from systeme.io appear automatically.
      </p>
      <div className="mt-6 rounded-lg border border-amo-border bg-amo-card p-6 shadow-sm">
        <ContactForm action={createContact} submitLabel="Create contact" />
      </div>
    </div>
  );
}
