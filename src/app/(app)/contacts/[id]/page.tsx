import Link from "next/link";
import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { formatDistanceToNow, format } from "date-fns";
import TagManager from "./tag-manager";
import NoteForm from "./note-form";
import DeleteContactButton from "./delete-button";
import InteractionLog from "../../interaction-log";
import CalendarEventsCard from "../../calendar-events-card";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getLinkedCalendarEvents } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { countryFullName } from "@/lib/country-flag";
import { getTimezoneForCountryState } from "@/lib/timezone";
import CountryFlag from "@/components/country-flag";
import PhoneDisplay from "@/components/phone-display";
import ContactTimezoneCard from "@/components/contact-timezone-card";
import PlatformIcon from "@/components/platform-icon";

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

function TechStackBlock({
  title,
  domain,
  hostingProvider,
  appLabel,
  app,
  t,
}: {
  title: string;
  domain?: string | null;
  hostingProvider?: string | null;
  appLabel: string;
  app?: string | null;
  t: ReturnType<typeof getDict>;
}) {
  if (!domain && !hostingProvider && !app) {
    return (
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</h4>
        <p className="mt-2 text-sm text-soft">—</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</h4>
      <div className="mt-2 space-y-1 text-sm text-ink">
        {domain && <p>{domain}</p>}
        {hostingProvider && <p className="text-soft">{t.contactForm.hostingProvider}: {hostingProvider}</p>}
        {app && <p className="text-soft">{appLabel}: {app}</p>}
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
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";
  const STAGE_LABELS = t.stages;

  const session = await auth();

  // One shared client for all the reads below — the plain `prisma` proxy
  // opens a brand-new connection on every property access, and this page
  // does several sequential reads (Google token, hour format, the contact
  // itself, all tags, linked calendar events), which is exactly the
  // pattern that risks Cloudflare Error 1102 without scoping.
  const { contact, allTags, hour12, calendarEvents } = await withScopedPrismaClient(async (db) => {
    const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
    const hour12 = await getHour12(session, db);
    const contact = await db.contact.findUnique({
      where: { id },
      include: {
        tags: { include: { tag: true } },
        fieldValues: { include: { definition: true } },
        projects: {
          orderBy: { createdAt: "desc" },
          include: {
            proposals: { orderBy: { createdAt: "desc" } },
            invoices: { orderBy: { createdAt: "desc" } },
          },
        },
        activity: { orderBy: { createdAt: "desc" }, take: 20, include: { user: true } },
        interactions: {
          orderBy: { occurredAt: "desc" },
          include: { loggedBy: true, project: true },
        },
        owner: true,
        subscriptions: { orderBy: { startedAt: "desc" } },
        courseEnrollments: { orderBy: { enrolledAt: "desc" } },
        communityMemberships: { orderBy: { joinedAt: "desc" } },
        emailLinks: { orderBy: { messageDate: "desc" }, take: 20 },
        socialLinks: { orderBy: { createdAt: "asc" } },
        extraAddresses: { orderBy: { order: "asc" } },
        messagingAccounts: { orderBy: { order: "asc" } },
        techStackItems: { orderBy: { order: "asc" } },
      },
    });
    const allTags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const calendarEvents = contact ? await getLinkedCalendarEvents(db, { contactId: contact.id }, googleAccessToken) : [];
    return { contact, allTags, hour12, calendarEvents };
  });

  if (!contact) notFound();

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  const otherFields = contact.fieldValues.filter((fv) => !DUPLICATE_FIELD_SLUGS.has(normalizeSlug(fv.fieldSlug)));

  const hasBillingContactInfo = contact.billingContactName || contact.billingEmail || contact.billingPhone;

  const hasTechStack = Boolean(
    contact.websiteDomain ||
      contact.websiteHostingProvider ||
      contact.websiteDesignApp ||
      contact.funnelsDomain ||
      contact.funnelsHostingProvider ||
      contact.funnelsDesignApp ||
      contact.emailDomain ||
      contact.emailHostingProvider ||
      contact.emailMarketingApp ||
      contact.storeDomain ||
      contact.storeHostingProvider ||
      contact.storeDesignApp ||
      contact.techStackItems.length > 0
  );

  const billingItems = contact.projects
    .flatMap((project) => [
      ...project.proposals.map((p) => ({
        kind: "proposal" as const,
        id: p.id,
        label: p.title,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
        createdAt: p.createdAt,
        projectId: project.id,
        projectName: project.name,
      })),
      ...project.invoices.map((inv) => ({
        kind: "invoice" as const,
        id: inv.id,
        label: inv.number || t.invoices.title,
        status: inv.status,
        amount: inv.amount as number | null,
        currency: inv.currency,
        createdAt: inv.createdAt,
        projectId: project.id,
        projectName: project.name,
      })),
    ])
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Primary address only (not the "other"/billing addresses) drives the
  // contact's own local time card.
  const contactTimeZone = getTimezoneForCountryState(contact.country, contact.state);
  const timeZoneLocationLabel =
    [contact.city, contact.state ?? countryFullName(contact.country)].filter(Boolean).join(", ") ||
    countryFullName(contact.country);

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
        <div className="flex flex-col items-end gap-2">
          {contactTimeZone && (
            <ContactTimezoneCard
              timeZone={contactTimeZone}
              locationLabel={timeZoneLocationLabel}
              hour12={hour12}
              lang={lang}
            />
          )}
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
                <dd className="space-y-0.5 text-ink">
                  <div>{contact.email}</div>
                  {contact.email2 && <div>{contact.email2}</div>}
                  {contact.extraEmails.map((email) => (
                    <div key={email}>{email}</div>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldPhones}</dt>
                <dd className="space-y-0.5 text-ink">
                  <div>
                    <PhoneDisplay value={contact.phone} country={contact.country} />
                  </div>
                  {contact.phone2 && (
                    <div>
                      <PhoneDisplay value={contact.phone2} country={contact.country} />
                    </div>
                  )}
                  {contact.extraPhones.map((phone) => (
                    <div key={phone}>
                      <PhoneDisplay value={phone} country={contact.country} />
                    </div>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-soft">{t.contactDetail.fieldWhatsapp}</dt>
                <dd className="text-ink">
                  <PhoneDisplay value={contact.whatsapp} country={contact.country} />
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

            {/* Addresses: Main (plus any extra addresses, below it), Billing */}
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div className="space-y-4 sm:col-span-2">
                <AddressBlock
                  title={t.contactDetail.mainAddressTitle}
                  address={contact.address}
                  city={contact.city}
                  state={contact.state}
                  zip={contact.zip}
                  country={contact.country}
                />
                {contact.extraAddresses.map((addr) => (
                  <AddressBlock
                    key={addr.id}
                    title={t.contactDetail.additionalAddressTitle}
                    address={addr.address}
                    city={addr.city}
                    state={addr.state}
                    zip={addr.zip}
                    country={addr.country}
                  />
                ))}
              </div>
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
                          <PhoneDisplay value={contact.billingPhone} country={contact.billingCountry} />
                        </span>
                      </p>
                    )}
                  </div>
                )}
                <p className="mt-3 text-xs text-soft">
                  {contact.autoSendInvoiceReminders ? t.contactDetail.invoiceRemindersAuto : t.contactDetail.invoiceRemindersManual}
                </p>
              </div>
            </div>

            {/* Tech stack: Website, Funnels, Email, Store — only shown once at least one is filled in */}
            {hasTechStack && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{t.contactForm.techStackTitle}</h3>
                <div className="mt-2 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  <TechStackBlock
                    title={t.contactForm.websiteGroupTitle}
                    domain={contact.websiteDomain}
                    hostingProvider={contact.websiteHostingProvider}
                    appLabel={t.contactForm.designApp}
                    app={contact.websiteDesignApp}
                    t={t}
                  />
                  <TechStackBlock
                    title={t.contactForm.funnelsGroupTitle}
                    domain={contact.funnelsDomain}
                    hostingProvider={contact.funnelsHostingProvider}
                    appLabel={t.contactForm.designApp}
                    app={contact.funnelsDesignApp}
                    t={t}
                  />
                  <TechStackBlock
                    title={t.contactForm.emailGroupTitle}
                    domain={contact.emailDomain}
                    hostingProvider={contact.emailHostingProvider}
                    appLabel={t.contactForm.marketingApp}
                    app={contact.emailMarketingApp}
                    t={t}
                  />
                  <TechStackBlock
                    title={t.contactForm.storeGroupTitle}
                    domain={contact.storeDomain}
                    hostingProvider={contact.storeHostingProvider}
                    appLabel={t.contactForm.designApp}
                    app={contact.storeDesignApp}
                    t={t}
                  />
                  {contact.techStackItems.map((item) => (
                    <TechStackBlock
                      key={item.id}
                      title={item.label}
                      domain={item.domain}
                      hostingProvider={item.hostingProvider}
                      appLabel={t.contactForm.appColumn}
                      app={item.app}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Social media links — real brand icon, whole card links out */}
            {contact.socialLinks.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{t.contactForm.socialLinksTitle}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contact.socialLinks.map((link) => (
                    <a
                      key={link.id}
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-card-border bg-field-bg px-3 py-1.5 text-xs font-medium text-ink hover:border-amo-gold"
                    >
                      <PlatformIcon platform={link.platform} className="h-4 w-4" />
                      {link.platform}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Other messaging apps (Telegram, Discord, etc.) — WhatsApp has
                its own dedicated field above */}
            {contact.messagingAccounts.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-soft">{t.contactForm.messagingAppsTitle}</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {contact.messagingAccounts.map((row) => (
                    <span
                      key={row.id}
                      className="flex items-center gap-1.5 rounded-full border border-card-border bg-field-bg px-3 py-1.5 text-xs font-medium text-ink"
                    >
                      <PlatformIcon platform={row.app} className="h-4 w-4" />
                      {row.handle}
                    </span>
                  ))}
                </div>
              </div>
            )}

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

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.purchasesTitle}</h2>
            {contact.subscriptions.length === 0 &&
            contact.courseEnrollments.length === 0 &&
            contact.communityMemberships.length === 0 ? (
              <p className="mt-2 text-sm text-soft">{t.contactDetail.noPurchasesYet}</p>
            ) : (
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
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.proposalsInvoicesTitle}</h2>
            {billingItems.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.contactDetail.noProposalsInvoicesYet}</p>
            ) : (
              <ul className="mt-3 divide-y divide-card-border">
                {billingItems.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-soft">
                      {item.kind === "proposal" ? t.proposals.title : t.invoices.title}
                    </span>
                    <span className="flex-1 font-medium text-ink">{item.label}</span>
                    {item.amount != null && (
                      <span className="text-soft">
                        {item.amount} {item.currency}
                      </span>
                    )}
                    <span className="text-xs text-soft">
                      {item.kind === "proposal" ? t.proposals.statuses[item.status as keyof typeof t.proposals.statuses] : t.invoices.statuses[item.status as keyof typeof t.invoices.statuses]}
                    </span>
                    <Link href={`/projects/${item.projectId}`} className="text-xs text-soft hover:underline">
                      {item.projectName} · {t.contactDetail.viewProject}
                    </Link>
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

          <CalendarEventsCard
            title={t.calendarApp.title}
            events={calendarEvents}
            noEventsLabel={t.calendarApp.noLinkedEvents}
            hour12={hour12}
            dateLocale={dateLocale}
            intlLocale={intlLocale}
          />

          <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
            <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
            <h2 className="font-display text-lg font-semibold text-ink">{t.contactDetail.linkedEmailsTitle}</h2>
            {contact.emailLinks.length === 0 ? (
              <p className="mt-3 text-sm text-soft">{t.contactDetail.noLinkedEmails}</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {contact.emailLinks.map((link) => (
                  <li key={link.id} className="text-sm">
                    {link.gmailLink ? (
                      <a href={link.gmailLink} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
                        {link.subject || "—"}
                      </a>
                    ) : (
                      <p className="text-ink">{link.subject || "—"}</p>
                    )}
                    <p className="text-xs text-soft">
                      {link.fromLabel}
                      {link.messageDate && ` · ${format(link.messageDate, "PPp", { locale: dateLocale })}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
