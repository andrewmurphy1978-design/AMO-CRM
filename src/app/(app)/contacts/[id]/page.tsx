import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow, format } from "date-fns";
import TagManager from "./tag-manager";
import NoteForm from "./note-form";
import DeleteContactButton from "./delete-button";
import InteractionLog from "../../interaction-log";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { countryFullName } from "@/lib/country-flag";
import CountryFlag from "@/components/country-flag";
import PhoneDisplay from "@/components/phone-display";

// Systeme.io custom field slugs that duplicate a real Contact column shown
// elsewhere on this page — hidden from "Other systeme.io fields" so the
// same data isn't shown twice. Matched loosely (case/punctuation-insensitive)
// since systeme.io's own slugs vary in casing.
const DUPLICATE_FIELD_SLUGS = new Set(["companyname", "postcode", "streetnumber", "streetaddress"]);

function normalizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fieldLabel(fv: { fieldSlug: string; definition: { label: string } | null }, t: ReturnType<typeof getDict>): string {
  const normalized = normalizeSlug(fv.fieldSlug);
  if (normalized === "servicesrequired") return t.contactDetail.servicesRequiredLabel;
  if (normalized === "projectgoaldescription") return t.contactDetail.projectGoalLabel;
  return fv.definition?.label ?? fv.fieldSlug;
}

function colonSep(lang: Lang): string {
  return lang === "fr" ? " :  " : ": ";
}

function ColonLine({ label, value, lang }: { label: string; value: string; lang: Lang }) {
  return (
    <p className="text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-soft">{label}</span>
      <span className="text-ink">
        {colonSep(lang)}
        {value}
      </span>
    </p>
  );
}

function languageDisplay(locale: string | null, t: ReturnType<typeof getDict>): string {
  if (!locale) return "—";
  const normalized = locale.trim().toLowerCase();
  if (normalized.startsWith("en")) return t.contactDetail.languageEnglish;
  if (normalized.startsWith("fr")) return t.contactDetail.languageFrench;
  return locale;
}

function AddressBlock({
  title,
  address,
  city,
  state,
  zip,
  country,
}: {
  title: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}) {
  const cityLine = [city, state, zip].filter(Boolean).join(" ");
  const isEmpty = !address && !cityLine && !country;
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</h3>
      <div className="mt-2 text-sm text-ink">
        {isEmpty ? (
          <p className="text-soft">—</p>
        ) : (
          <>
            {address && <p>{address}</p>}
            {cityLine && <p>{cityLine}</p>}
            {country && (
              <p className="inline-flex items-center gap-1.5">
                <CountryFlag country={country} /> {countryFullName(country)}
              </p>
            )}
          </>
        )}
      </div>
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
      subscriptions: { orderBy: { startedAt: "desc" } },
      courseEnrollments: { orderBy: { enrolledAt: "desc" } },
      communityMemberships: { orderBy: { joinedAt: "desc" } },
    },
  });

  if (!contact) notFound();

  const allTags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  const otherFields = contact.fieldValues.filter((fv) => !DUPLICATE_FIELD_SLUGS.has(normalizeSlug(fv.fieldSlug)));

  const hasBillingContactInfo = contact.billingContactName || contact.billingEmail || contact.billingPhone;

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

            {/* Line 1: Email (wide), Phone numbers (stacked), WhatsApp */}
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldEmail}</dt>
                <dd className="text-ink">{contact.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldPhones}</dt>
                <dd className="space-y-0.5 text-ink">
                  <div>
                    <PhoneDisplay value={contact.phone} />
                  </div>
                  {contact.phone2 && (
                    <div>
                      <PhoneDisplay value={contact.phone2} />
                    </div>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldWhatsapp}</dt>
                <dd className="text-ink">
                  <PhoneDisplay value={contact.whatsapp} />
                </dd>
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
                <dd className="text-ink">{languageDisplay(contact.locale, t)}</dd>
              </div>
            </dl>

            {/* Addresses: Main, Other, Billing side by side */}
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <AddressBlock
                title={t.contactDetail.mainAddressTitle}
                address={contact.address}
                city={contact.city}
                state={contact.state}
                zip={contact.zip}
                country={contact.country}
              />
              <AddressBlock
                title={t.contactDetail.otherAddressTitle}
                address={contact.otherAddress}
                city={contact.otherCity}
                state={contact.otherState}
                zip={contact.otherZip}
                country={contact.otherCountry}
              />
              <div>
                <AddressBlock
                  title={t.contactDetail.billingAddressTitle}
                  address={contact.billingAddress}
                  city={contact.billingCity}
                  state={contact.billingState}
                  zip={contact.billingZip}
                  country={contact.billingCountry}
                />
                {hasBillingContactInfo && (
                  <div className="mt-3 space-y-1">
                    {contact.billingContactName && (
                      <ColonLine label={t.contactDetail.billingLabelContact} value={contact.billingContactName} lang={lang} />
                    )}
                    {contact.billingEmail && (
                      <ColonLine label={t.contactDetail.billingLabelEmail} value={contact.billingEmail} lang={lang} />
                    )}
                    {contact.billingPhone && (
                      <p className="text-sm">
                        <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                          {t.contactDetail.billingLabelPhone}
                        </span>
                        <span className="text-ink">
                          {colonSep(lang)}
                          <PhoneDisplay value={contact.billingPhone} />
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Source (grouped) and other systeme.io fields */}
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{t.contactDetail.fieldSource}</h3>
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-ink">{contact.source ?? "—"}</p>
                  {contact.systemeIoRegisteredAt && (
                    <ColonLine
                      label={t.contactDetail.registeredPrefix}
                      value={format(contact.systemeIoRegisteredAt, "PP", { locale: dateLocale })}
                      lang={lang}
                    />
                  )}
                  {contact.lastSyncedAt && (
                    <ColonLine
                      label={t.contactDetail.lastSyncedPrefix}
                      value={formatDistanceToNow(contact.lastSyncedAt, { addSuffix: true, locale: dateLocale })}
                      lang={lang}
                    />
                  )}
                </div>
              </div>
              {otherFields.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                    {t.contactDetail.otherFields}
                  </h3>
                  <dl className="mt-2 grid grid-cols-1 gap-3 text-sm">
                    {otherFields.map((fv) => (
                      <div key={fv.id}>
                        <dt className="text-xs uppercase tracking-wide text-soft">{fieldLabel(fv, t)}</dt>
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

          {(contact.subscriptions.length > 0 ||
            contact.courseEnrollments.length > 0 ||
            contact.communityMemberships.length > 0) && (
            <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
              <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
              <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.purchasesTitle}</h2>
              <div className="mt-4 grid gap-6 sm:grid-cols-3">
                {contact.subscriptions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                      {t.contactDetail.subscriptionsTitle}
                    </h3>
                    <ul className="mt-2 space-y-2 text-sm text-ink">
                      {contact.subscriptions.map((sub) => (
                        <li key={sub.id}>
                          <p className="font-medium">{sub.planName ?? t.contactDetail.subscriptionsTitle}</p>
                          <p className="text-xs text-soft">
                            {sub.status ?? "—"}
                            {sub.amount != null && ` · ${sub.amount}${sub.currency ? ` ${sub.currency}` : ""}`}
                            {sub.startedAt &&
                              ` · ${t.contactDetail.since} ${format(sub.startedAt, "PP", { locale: dateLocale })}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {contact.courseEnrollments.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                      {t.contactDetail.enrollmentsTitle}
                    </h3>
                    <ul className="mt-2 space-y-2 text-sm text-ink">
                      {contact.courseEnrollments.map((enrollment) => (
                        <li key={enrollment.id}>
                          <p className="font-medium">{enrollment.courseName ?? t.contactDetail.enrollmentsTitle}</p>
                          <p className="text-xs text-soft">
                            {enrollment.status ?? "—"}
                            {enrollment.enrolledAt &&
                              ` · ${t.contactDetail.since} ${format(enrollment.enrolledAt, "PP", { locale: dateLocale })}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {contact.communityMemberships.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">
                      {t.contactDetail.membershipsTitle}
                    </h3>
                    <ul className="mt-2 space-y-2 text-sm text-ink">
                      {contact.communityMemberships.map((membership) => (
                        <li key={membership.id}>
                          <p className="font-medium">{membership.communityName ?? t.contactDetail.membershipsTitle}</p>
                          <p className="text-xs text-soft">
                            {membership.status ?? "—"}
                            {membership.joinedAt &&
                              ` · ${t.contactDetail.since} ${format(membership.joinedAt, "PP", { locale: dateLocale })}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

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
