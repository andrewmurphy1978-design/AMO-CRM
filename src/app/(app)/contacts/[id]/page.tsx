import Link from "next/link";
import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { formatDistanceToNow, format } from "date-fns";
import NoteForm from "./note-form";
import DeleteContactButton from "./delete-button";
import InteractionLog from "../../interaction-log";
import CalendarEventsCard from "../../calendar-events-card";
import { auth } from "@/lib/auth";
import { getValidAccessToken } from "@/lib/google";
import { getLinkedCalendarEvents, getEventLinkTargets } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { countryFullName } from "@/lib/country-flag";
import { getTimezoneForCountryState, utcOffsetLabel } from "@/lib/timezone";
import { stateLabelForCountry } from "@/lib/address-labels";
import { CURRENCIES } from "@/lib/currencies";
import { tagKind, TAG_KIND_COLORS, TAG_KIND_RANK } from "@/lib/tag-colors";
import CountryFlag from "@/components/country-flag";
import PhoneDisplay from "@/components/phone-display";
import PlatformIcon from "@/components/platform-icon";
import PageHeader from "../../page-header";
import Card from "@/components/section-card";
import LocalTimeCard from "@/components/local-time-card";
import LinkedEmailsList from "../../linked-emails-list";

const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-soft";

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
  return lang === "fr" ? " :  " : ": ";
}

function ColonLine({ label, value, lang }: { label: string; value: string; lang: Lang }) {
  return (
    <p className="text-sm">
      <span className={LABEL_CLASS}>{label}</span>
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

// A read-only label+value pair matching the Edit form's own field label
// styling, for the General info / Other info cards' plain-text fields.
function InfoField({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <p className={LABEL_CLASS}>{label}</p>
      <p className="mt-1 text-sm text-ink">{value || "—"}</p>
    </div>
  );
}

// Icon + app/platform name + ID (handle, username, or link) — the shared
// look for Instant messaging, Social media, and VoIP app rows.
function AppIdChip({ platform, id, href }: { platform: string; id: string; href?: string }) {
  const content = (
    <>
      <PlatformIcon platform={platform} className="h-4 w-4 shrink-0" />
      <span className="font-semibold">{platform}</span>
      <span className="min-w-0 truncate text-soft">{id}</span>
    </>
  );
  const className =
    "flex max-w-full items-center gap-1.5 rounded-full border border-card-border bg-field-bg px-3 py-1.5 text-xs font-medium text-ink";
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={`${className} hover:border-amo-gold`}>
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  );
}

function TagPill({ name }: { name: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TAG_KIND_COLORS[tagKind(name)]}`}>{name}</span>;
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
      <h3 className={LABEL_CLASS}>{title}</h3>
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
        <h4 className={LABEL_CLASS}>{title}</h4>
        <p className="mt-2 text-sm text-soft">—</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className={LABEL_CLASS}>{title}</h4>
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
  // itself, linked calendar events), which is exactly the pattern that
  // risks Cloudflare Error 1102 without scoping.
  const {
    contact,
    hour12,
    calendarEvents,
    calendarEventLinks,
    calendarContactOptions,
    calendarProjectOptions,
    calendarTaskOptions,
    calendarBookingOptions,
  } = await withScopedPrismaClient(async (db) => {
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
        voipAccounts: { orderBy: { order: "asc" } },
        techStackItems: { orderBy: { order: "asc" } },
      },
    });
    const calendarEvents = contact ? await getLinkedCalendarEvents(db, { contactId: contact.id }, googleAccessToken) : [];
    const calendarEventLinks = calendarEvents.length > 0 ? await getEventLinkTargets(db, calendarEvents.map((e) => e.id)) : {};

    // The event edit dialog's own contact/project/task/booking pickers —
    // same lists the full Calendar page and Dashboard card already ship,
    // needed here too now that this card opens that same dialog instead of
    // just linking out to Google Calendar. Sequential, not Promise.all —
    // running these concurrently against the same Hyperdrive connection is
    // exactly the pattern that trips Cloudflare's Error 1102 resource limit
    // (same lesson as the comment above this function), and it only gets
    // more likely to fire the bigger the contacts table grows.
    const allContacts = await db.contact.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 300,
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    const allProjects = await db.project.findMany({ orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, contactId: true } });
    const allTasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true, projectId: true },
    });
    const allBookings = await db.booking.findMany({
      orderBy: { scheduledFor: "desc" },
      take: 100,
      select: { id: true, eventName: true, contactName: true, scheduledFor: true, contactId: true },
    });

    return {
      contact,
      hour12,
      calendarEvents,
      calendarEventLinks,
      calendarContactOptions: allContacts.map((c) => ({
        id: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "",
        email: c.email,
      })),
      calendarProjectOptions: allProjects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId })),
      calendarTaskOptions: allTasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId })),
      calendarBookingOptions: allBookings,
    };
  });

  if (!contact) notFound();

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email || "";

  const calendarBookingLabelOptions = calendarBookingOptions.map((b) => ({
    id: b.id,
    label: `${b.eventName ?? t.linkPicker.booking} (${b.scheduledFor ? format(b.scheduledFor, "MMM d") : "?"})`,
    contactId: b.contactId,
  }));
  const calendarLinkPickerLabels = {
    contact: t.linkPicker.contact,
    project: t.linkPicker.project,
    task: t.linkPicker.task,
    booking: t.linkPicker.booking,
    none: t.linkPicker.none,
    clear: t.linkPicker.clear,
    searchPlaceholder: t.linkPicker.searchPlaceholder,
    noResults: t.linkPicker.noResults,
  };

  const otherFields = contact.fieldValues.filter((fv) => !DUPLICATE_FIELD_SLUGS.has(normalizeSlug(fv.fieldSlug)));

  const hasBillingContactInfo = contact.billingContactName || contact.billingEmail || contact.billingPhone;

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
  const proposalItems = billingItems.filter((item) => item.kind === "proposal");
  const invoiceItems = billingItems.filter((item) => item.kind === "invoice");

  // An explicitly-chosen Time Zone on the contact record wins over the
  // country/state-derived guess. Primary address only (not the "other"/
  // billing addresses) drives the fallback guess.
  const contactTimeZone = contact.timeZone || getTimezoneForCountryState(contact.country, contact.state);

  // Language tags first (matching the Edit form and the Contacts list
  // page's own ordering), each colored the same way everywhere.
  const sortedTagRows = [...contact.tags].sort(
    (a, b) => TAG_KIND_RANK[tagKind(a.tag.name)] - TAG_KIND_RANK[tagKind(b.tag.name)] || a.tag.name.localeCompare(b.tag.name)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          <div className="flex gap-2">
            <Link href={`/contacts/${contact.id}/edit`} className="btn-primary rounded-md px-4 py-2 text-sm font-semibold shadow-sm">
              {t.contactDetail.edit}
            </Link>
            <DeleteContactButton lang={lang} contactId={contact.id} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card color="general" title={t.contactForm.cardGeneralInfo}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfoField label={t.contactForm.firstName} value={contact.firstName} />
              <InfoField label={t.contactForm.lastName} value={contact.lastName} />
              <InfoField label={t.contactForm.company} value={contact.company} />
              <div className="lg:row-span-4">
                <p className={LABEL_CLASS}>{t.contactForm.tags}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {sortedTagRows.length === 0 && <p className="text-sm text-soft">—</p>}
                  {sortedTagRows.map((ct) => (
                    <TagPill key={ct.tagId} name={ct.tag.name} />
                  ))}
                </div>
              </div>

              <InfoField label={t.contactForm.companyType} value={contact.companyType} />
              <InfoField label={t.contactForm.jurisdictionCountry} value={contact.jurisdictionCountry} />
              <InfoField
                label={`${stateLabelForCountry(contact.jurisdictionCountry ?? undefined, lang)} ${t.contactForm.ofJurisdiction}`}
                value={contact.jurisdictionRegion}
              />

              <InfoField label={t.contactForm.industry} value={contact.industry} />
              <InfoField label={t.contactForm.language} value={languageDisplay(contact.locale, t)} />
              <div className="flex flex-col justify-end lg:row-span-2">
                {contactTimeZone ? (
                  <LocalTimeCard timeZone={contactTimeZone} hour12={hour12} lang={lang} label={t.contactForm.timeZoneNow} />
                ) : null}
              </div>

              <InfoField label={t.contactForm.stage} value={STAGE_LABELS[contact.stage]} />
              <InfoField
                label={t.contactForm.timeZone}
                value={contact.timeZone ? `(${utcOffsetLabel(contact.timeZone)}) ${contact.timeZone.replace(/_/g, " ")}` : undefined}
              />
            </div>

            <div className="rounded-lg border border-card-border bg-black/[0.02] p-4">
              <h3 className={LABEL_CLASS}>{t.contactForm.cardInvoice}</h3>
              <div className="mt-3 space-y-4">
                <p className="text-sm text-ink">
                  {contact.autoSendInvoiceReminders ? t.contactDetail.invoiceRemindersAuto : t.contactDetail.invoiceRemindersManual}
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoField
                    label={t.contactForm.preferredCurrency}
                    value={CURRENCIES.find((c) => c.value === contact.preferredCurrency)?.label}
                  />
                  <InfoField label={t.contactForm.paymentTerms} value={contact.paymentTerms} />
                  <InfoField label={t.contactForm.paymentSchedule} value={contact.paymentSchedule} />
                  <InfoField
                    label={t.contactForm.defaultDiscount}
                    value={contact.defaultDiscount != null ? `${contact.defaultDiscount}%` : undefined}
                  />
                </div>
              </div>
            </div>
          </Card>

          {(contact.nickname || contact.jobTitle || contact.birthday || contact.avatarUrl) && (
            <Card color="personal" title={t.contactForm.cardPersonalInfo}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {contact.avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- an arbitrary external Google-hosted URL, not a local/optimizable asset
                  <img src={contact.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
                )}
                <InfoField label={t.contactForm.nickname} value={contact.nickname} />
                <InfoField label={t.contactForm.jobTitle} value={contact.jobTitle} />
                <InfoField label={t.contactForm.birthday} value={contact.birthday} />
              </div>
            </Card>
          )}

          <Card color="contact" title={t.contactForm.cardContactInfo}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.7fr)_minmax(0,1.9fr)]">
              <div>
                <p className={LABEL_CLASS}>{t.contactForm.emails}</p>
                <div className="mt-1 space-y-0.5 text-sm text-ink">
                  <p>{contact.email}</p>
                  {contact.email2 && <p>{contact.email2}</p>}
                  {contact.extraEmails.map((email) => (
                    <p key={email}>{email}</p>
                  ))}
                </div>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.contactDetail.fieldPhones}</p>
                <div className="mt-1 space-y-0.5 text-sm text-ink">
                  <p>
                    <PhoneDisplay value={contact.phone} country={contact.country} />
                  </p>
                  {contact.phone2 && (
                    <p>
                      <PhoneDisplay value={contact.phone2} country={contact.country} />
                    </p>
                  )}
                  {contact.extraPhones.map((phone) => (
                    <p key={phone}>
                      <PhoneDisplay value={phone} country={contact.country} />
                    </p>
                  ))}
                </div>
              </div>
              <div>
                <p className={LABEL_CLASS}>{t.contactForm.messagingAppsTitle}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {contact.messagingAccounts.length === 0 && <p className="text-sm text-soft">—</p>}
                  {contact.messagingAccounts.map((row) => (
                    <AppIdChip key={row.id} platform={row.app} id={row.handle} />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card color="addresses" title={t.contactForm.cardAddresses}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
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
              <div className="self-start">
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
                    {contact.billingPhone && (
                      <p className="text-sm">
                        <span className={LABEL_CLASS}>{t.contactDetail.billingLabelPhone}</span>
                        <span className="text-ink">
                          {colonSep(lang)}
                          <PhoneDisplay value={contact.billingPhone} country={contact.billingCountry} />
                        </span>
                      </p>
                    )}
                    {contact.billingEmail && (
                      <ColonLine label={t.contactDetail.billingLabelEmail} value={contact.billingEmail} lang={lang} />
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card color="techStack" title={t.contactForm.techStackTitle}>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card color="social" title={t.contactForm.cardSocialMedia}>
              <div className="flex flex-wrap gap-1.5">
                {contact.socialLinks.length === 0 && <p className="text-sm text-soft">—</p>}
                {contact.socialLinks.map((link) => (
                  <AppIdChip key={link.id} platform={link.platform} id={link.url} href={link.url} />
                ))}
              </div>
            </Card>
            <Card color="voip" title={t.contactForm.cardVoipApps}>
              <div className="flex flex-wrap gap-1.5">
                {contact.voipAccounts.length === 0 && <p className="text-sm text-soft">—</p>}
                {contact.voipAccounts.map((row) => (
                  <AppIdChip key={row.id} platform={row.app} id={row.handle} />
                ))}
              </div>
            </Card>
          </div>

          <Card color="other" title={t.contactForm.cardOtherInfo}>
            <div className="grid gap-4 sm:grid-cols-3">
              <InfoField label={t.contactDetail.fieldSource} value={contact.source} />
              <InfoField
                label={t.contactDetail.registeredPrefix}
                value={
                  contact.systemeIoRegisteredAt
                    ? format(contact.systemeIoRegisteredAt, "PP", { locale: dateLocale })
                    : !contact.systemeIoId && contact.createdAt
                      ? format(contact.createdAt, "PP", { locale: dateLocale })
                      : undefined
                }
              />
              <InfoField
                label={t.contactDetail.lastSyncedPrefix}
                value={contact.lastSyncedAt ? formatDistanceToNow(contact.lastSyncedAt, { addSuffix: true, locale: dateLocale }) : undefined}
              />
            </div>
            {otherFields.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {otherFields.map((fv) => (
                  <InfoField key={fv.id} label={fieldLabel(fv, t)} value={fv.value} />
                ))}
              </div>
            )}
          </Card>

          <Card color="notes" title={t.contactForm.cardNotes}>
            <p className="whitespace-pre-wrap text-sm text-ink">{contact.notes || "—"}</p>
          </Card>
        </div>

        <div className="space-y-6">
          <div id="projects">
            <Card
              color="projects"
              title={t.contactDetail.projectsTitle}
              actions={
                <Link href={`/projects/new?contactId=${contact.id}`} className="text-xs font-semibold text-white hover:underline">
                  + {t.contactDetail.newProject}
                </Link>
              }
            >
              {contact.projects.length === 0 ? (
                <p className="text-sm text-soft">{t.contactDetail.noProjectsYet}</p>
              ) : (
                <ul className="divide-y divide-card-border">
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
            </Card>
          </div>

          <CalendarEventsCard
            title={t.calendarApp.title}
            events={calendarEvents}
            links={calendarEventLinks}
            contacts={calendarContactOptions}
            projects={calendarProjectOptions}
            tasks={calendarTaskOptions}
            bookings={calendarBookingLabelOptions}
            noEventsLabel={t.calendarApp.noLinkedEvents}
            hour12={hour12}
            dateLocale={dateLocale}
            intlLocale={intlLocale}
            lang={lang}
            eventDialogLabels={t.eventDialog}
            eventViewDialogLabels={t.eventViewDialog}
            linkPickerLabels={calendarLinkPickerLabels}
          />

          <Card
            color="linkedEmails"
            title={
              <>
                {t.contactDetail.linkedEmailsTitle}
                {contact.emailLinks.length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">
                    {contact.emailLinks.length}
                  </span>
                )}
              </>
            }
          >
            <LinkedEmailsList
              emailLinks={contact.emailLinks.map((link) => ({
                id: link.id,
                gmailThreadId: link.gmailThreadId,
                subject: link.subject,
                fromLabel: link.fromLabel,
                messageDate: link.messageDate ? link.messageDate.toISOString() : null,
                gmailLink: link.gmailLink,
              }))}
              noLinkedEmailsLabel={t.contactDetail.noLinkedEmails}
              dateLocale={dateLocale}
              intlLocale={intlLocale}
              hour12={hour12}
              emailDialogLabels={t.emailDialog}
              emailComposeLabels={t.emailCompose}
            />
          </Card>

          <Card color="purchases" title={t.contactDetail.purchasesTitle}>
            {contact.subscriptions.length === 0 &&
            contact.courseEnrollments.length === 0 &&
            contact.communityMemberships.length === 0 ? (
              <p className="mt-2 text-sm text-soft">{t.contactDetail.noPurchasesYet}</p>
            ) : (
              <div className="mt-4 space-y-4">
                {contact.subscriptions.length > 0 && (
                  <div>
                    <h3 className={LABEL_CLASS}>{t.contactDetail.subscriptionsTitle}</h3>
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
                    <h3 className={LABEL_CLASS}>{t.contactDetail.enrollmentsTitle}</h3>
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
                    <h3 className={LABEL_CLASS}>{t.contactDetail.membershipsTitle}</h3>
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
          </Card>

          <Card
            color="proposals"
            title={t.proposals.title}
            actions={
              <Link href="#projects" className="text-xs font-semibold text-white hover:underline">
                + {t.contactDetail.newProposal}
              </Link>
            }
          >
            {proposalItems.length === 0 ? (
              <p className="text-sm text-soft">{t.contactDetail.noProposalsYet}</p>
            ) : (
              <ul className="divide-y divide-card-border">
                {proposalItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="flex-1 font-medium text-ink">{item.label}</span>
                    {item.amount != null && (
                      <span className="text-soft">
                        {item.amount} {item.currency}
                      </span>
                    )}
                    <span className="text-xs text-soft">{t.proposals.statuses[item.status as keyof typeof t.proposals.statuses]}</span>
                    <Link href={`/projects/${item.projectId}`} className="text-xs text-soft hover:underline">
                      {item.projectName} · {t.contactDetail.viewProject}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            color="invoices"
            title={t.invoices.title}
            actions={
              <Link href="#projects" className="text-xs font-semibold text-white hover:underline">
                + {t.contactDetail.newInvoice}
              </Link>
            }
          >
            {invoiceItems.length === 0 ? (
              <p className="text-sm text-soft">{t.contactDetail.noInvoicesYet}</p>
            ) : (
              <ul className="divide-y divide-card-border">
                {invoiceItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="flex-1 font-medium text-ink">{item.label}</span>
                    {item.amount != null && (
                      <span className="text-soft">
                        {item.amount} {item.currency}
                      </span>
                    )}
                    <span className="text-xs text-soft">{t.invoices.statuses[item.status as keyof typeof t.invoices.statuses]}</span>
                    <Link href={`/projects/${item.projectId}`} className="text-xs text-soft hover:underline">
                      {item.projectName} · {t.contactDetail.viewProject}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card color="interactions" title={t.contactDetail.callsEmails}>
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
          </Card>

          <Card color="activity" title={t.contactDetail.systemActivity}>
            <NoteForm lang={lang} contactId={contact.id} />
            <ul className="space-y-3">
              {contact.activity.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <p className="text-ink">{entry.message}</p>
                  <p className="text-xs text-soft">
                    {formatDistanceToNow(entry.createdAt, { addSuffix: true, locale: dateLocale })}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
