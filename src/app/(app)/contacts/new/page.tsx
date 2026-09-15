import ContactForm from "../contact-form";
import { createContact } from "@/actions/contacts";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

export default async function NewContactPage() {
  const lang = await getLang();
  const t = getDict(lang);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-ink">{t.newContactPage.title}</h1>
      <p className="mt-1 text-sm text-soft">{t.newContactPage.subtitle}</p>
      <div className="mt-6 rounded-lg border border-card-border bg-card-bg p-6 shadow-sm">
        <ContactForm action={createContact} submitLabel={t.contactForm.createContact} lang={lang} />
      </div>
    </div>
  );
}
