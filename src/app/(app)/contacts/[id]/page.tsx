import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow, format } from "date-fns";
import TagManager from "./tag-manager";
import NoteForm from "./note-form";
import DeleteContactButton from "./delete-button";
import InteractionLog from "../../interaction-log";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { countryFlag } from "@/lib/country-flag";
import { formatPhoneDisplay } from "@/lib/phone-display";

function AddressLines({
  address,
  city,
  state,
  zip,
  country,
}: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}) {
  const cityLine = [city, state, zip].filter(Boolean).join(" ");
  if (!address && !cityLine && !country) return <p className="text-sm text-soft">—</p>;
  return (
    <div className="text-sm text-ink">
      {address && <p>{address}</p>}
      {cityLine && <p>{cityLine}</p>}
      {country && (
        <p>
          {countryFlag(country)} {country}
        </p>
      )}
    </div>
  );
}

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const STAGE_LABELS = t.stages;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      fieldValues: { include: { definition: true } },
      projects: { orderBy: { createdAt: "desc" } },
      activity: { orderBy: { createdAt: "desc" }, take: 20, include: { user: true } },
      interactions: {
        orderBy: { occurredAt: "desc" },
        include: { loggedBy: true, project: true },
      },
      owner: true,
    },
  });

  if (!contact) notFound();

  const allTags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  const systemFields: { label: string; value: string | null }[] = [
    { label: t.contactDetail.fieldSource, value: contact.source },
    {
      label: t.contactDetail.fieldSystemeIoRegistered,
      value: contact.systemeIoRegisteredAt
        ? format(contact.systemeIoRegisteredAt, "PP", { locale: dateLocale })
        : null,
    },
    {
      label: t.contactDetail.fieldLastSynced,
      value: contact.lastSyncedAt ? formatDistanceToNow(contact.lastSyncedAt, { addSuffix: true, locale: dateLocale }) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{fullName}</h1>
          <p className="mt-1 text-sm text-soft">
            {STAGE_LABELS[contact.stage]}
            {contact.systemeIoId && ` · systeme.io #${contact.systemeIoId}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/contacts/${contact.id}/edit`}
            className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
          >
            {t.contactDetail.edit}
          </Link>
          <Link
            href={`/projects/new?contactId=${contact.id}`}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
          >
            {t.contactDetail.newProject}
          </Link>
          <DeleteContactButton lang={lang} contactId={contact.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.contactDetailsTitle}</h2>

            {/* Line 1: Email, Phone, Second phone, WhatsApp */}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldEmail}</dt>
                <dd className="text-ink">{contact.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldPhone}</dt>
                <dd className="text-ink">{formatPhoneDisplay(contact.phone) ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldPhone2}</dt>
                <dd className="text-ink">{formatPhoneDisplay(contact.phone2) ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldWhatsapp}</dt>
                <dd className="text-ink">{formatPhoneDisplay(contact.whatsapp) ?? "—"}</dd>
              </div>
            </dl>

            {/* Line 2: Company, Language */}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldCompany}</dt>
                <dd className="text-ink">{contact.company ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldLanguage}</dt>
                <dd className="text-ink">{contact.locale ?? "—"}</dd>
              </div>
            </dl>

            {/* Addresses: Main on the left, Other + Billing stacked on the right */}
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                  {t.contactDetail.mainAddressTitle}
                </h3>
                <div className="mt-2">
                  <AddressLines
                    address={contact.address}
                    city={contact.city}
                    state={contact.state}
                    zip={contact.zip}
                    country={contact.country}
                  />
                </div>
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                    {t.contactDetail.otherAddressTitle}
                  </h3>
                  <div className="mt-2">
                    <AddressLines
                      address={contact.otherAddress}
                      city={contact.otherCity}
                      state={contact.otherState}
                      zip={contact.otherZip}
                      country={contact.otherCountry}
                    />
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                    {t.contactDetail.billingAddressTitle}
                  </h3>
                  <div className="mt-2">
                    <AddressLines
                      address={contact.billingAddress}
                      city={contact.billingCity}
                      state={contact.billingState}
                      zip={contact.billingZip}
                      country={contact.billingCountry}
                    />
                  </div>
                  {(contact.billingContactName || contact.billingEmail || contact.billingPhone) && (
                    <dl className="mt-2 space-y-1 text-sm">
                      {contact.billingContactName && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-soft">
                            {t.contactDetail.billingContactName}
                          </dt>
                          <dd className="text-ink">{contact.billingContactName}</dd>
                        </div>
                      )}
                      {contact.billingEmail && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.billingEmail}</dt>
                          <dd className="text-ink">{contact.billingEmail}</dd>
                        </div>
                      )}
                      {contact.billingPhone && (
                        <div>
                          <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.billingPhone}</dt>
                          <dd className="text-ink">{formatPhoneDisplay(contact.billingPhone)}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </div>
              </div>
            </div>

            {/* Source / systeme.io registered / last synced, and other systeme.io fields */}
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <dl className="grid grid-cols-1 gap-3 text-sm">
                {systemFields
                  .filter((f) => f.value)
                  .map((f) => (
                    <div key={f.label}>
                      <dt className="text-xs uppercase tracking-wide text-soft">{f.label}</dt>
                      <dd className="text-ink">{f.value}</dd>
                    </div>
                  ))}
              </dl>
              {contact.fieldValues.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                    {t.contactDetail.otherFields}
                  </h3>
                  <dl className="mt-2 grid grid-cols-1 gap-3 text-sm">
                    {contact.fieldValues.map((fv) => (
                      <div key={fv.id}>
                        <dt className="text-xs uppercase tracking-wide text-soft">
                          {fv.definition?.label ?? fv.fieldSlug}
                        </dt>
                        <dd className="text-ink">{fv.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>

            {contact.notes && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{t.contactDetail.notes}</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{contact.notes}</p>
              </div>
            )}
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.projectsTitle}</h2>
            </div>
            {contact.projects.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.contactDetail.noProjectsYet}</p>
            ) : (
              <ul className="mt-3 divide-y divide-card-border">
                {contact.projects.map((project) => (
                  <li key={project.id} className="py-2">
                    <Link href={`/projects/${project.id}`} className="font-medium text-ink hover:underline">
                      {project.name}
                    </Link>
                    <span className="ml-2 text-xs text-soft">{t.projectStatuses[project.status]}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.callsEmails}</h2>
            <div className="mt-3">
              <InteractionLog
                lang={lang}
                contactId={contact.id}
                interactions={contact.interactions.map((i) => ({
                  id: i.id,
                  type: i.type,
                  subject: i.subject,
                  notes: i.notes,
                  occurredAt: i.occurredAt.toISOString(),
                  loggedBy: i.loggedBy ? { name: i.loggedBy.name } : null,
                  project: i.project ? { id: i.project.id, name: i.project.name } : null,
                }))}
              />
            </div>
          </section>

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.systemActivity}</h2>
            <NoteForm lang={lang} contactId={contact.id} />
            <ul className="mt-4 space-y-3">
              {contact.activity.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <p className="text-ink">{entry.message}</p>
                  <p className="text-xs text-soft">
                    {formatDistanceToNow(entry.createdAt, { addSuffix: true, locale: dateLocale })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.tagsTitle}</h2>
            <TagManager
              lang={lang}
              contactId={contact.id}
              tags={contact.tags.map((ct) => ({ id: ct.tagId, name: ct.tag.name }))}
              allTags={allTags}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
