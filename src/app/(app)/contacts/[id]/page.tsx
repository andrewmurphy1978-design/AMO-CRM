import Link from "next/link";
import { notFound } from "next/navigation";
import { withScopedPrismaClient } from "@/lib/prisma";
import { formatDistanceToNow, format } from "date-fns";
import NoteForm from "./note-form";
import DeleteContactButton from "./delete-button";
import CalendarEventsCard from "../../calendar-events-card";
import { auth } from "@/lib/auth";
import { getValidAccessToken, fetchGmailThreadSnapshot } from "@/lib/google";
import { getTwilioConfig, contactPhoneOptions } from "@/lib/twilio";
import { getLinkedCalendarEvents, getEventLinkTargets } from "@/lib/calendar-links";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { countryFullName } from "@/lib/country-flag";
import { getTimezoneForCountryState, utcOffsetLabel } from "@/lib/timezone";
import { stateLabelForCountry } from "@/lib/address-labels";
import { CURRENCIES } from "@/lib/currencies";
import CountryFlag from "@/components/country-flag";
import PhoneDisplay from "@/components/phone-display";
import PlatformIcon from "@/components/platform-icon";
import PageHeader from "../../page-header";
import Card from "@/components/section-card";
import LocalTimeCard from "@/components/local-time-card";
import LinkedEmailsList from "../../linked-emails-list";
import ContactCredentialsCard from "./contact-credentials-card";
import ContactEmailLinks from "./contact-email-links";
import NewEmailButton from "./new-email-button";
import CallsSmsCard from "./calls-sms-card";
import { CONTACT_SYNC_APPS } from "@/lib/contact-sync";
import { reciprocalRelationType } from "@/lib/contact-form-fields";
import { telHref, messagingAppLink, voipAppLink } from "@/lib/app-deep-links";
import { formatBirthday } from "@/lib/birthday";
import { initialsFor } from "@/lib/avatar";
import TagManager from "./tag-manager";
import GeneralInfoDialog from "./general-info-dialog";
import ContactInfoDialog from "./contact-info-dialog";
import SocialDialog from "./social-dialog";
import VoipDialog from "./voip-dialog";
import AddressesDialog from "./addresses-dialog";
import InvoiceDialog from "./invoice-dialog";
import TechStackDialog from "./tech-stack-dialog";
import DomainsDialog from "./domains-dialog";
import RelationsDialog from "./relations-dialog";
import OtherInfoDialog from "./other-info-dialog";
import NotesDialog from "./notes-dialog";
import NoteTimestamps from "./note-timestamps";
import {
  updateContactGeneralInfo,
  updateContactInfo,
  updateContactSocial,
  updateContactVoip,
  updateContactAddresses,
  updateContactInvoice,
  updateContactTechStack,
  updateContactDomains,
  updateContactRelations,
  updateContactOtherInfo,
  updateContactNotes,
} from "@/actions/contact-sections";

const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-soft";

// Systeme.io custom field slugs that duplicate a real Contact column shown
// elsewhere on this page — hidden from "Other systeme.io fields" so the
// same data isn't shown twice. Matched loosely (case/punctuation-insensitive)
// since systeme.io's own slugs vary in casing.
const DUPLICATE_FIELD_SLUGS = new Set(["companyname", "postcode", "streetnumber", "streetaddress"]);

// Services required / Project goal description now have their own dedicated
// spot in the General info card (below Website) instead of showing generically
// in "Other info" — excluded from that generic list so they don't show twice.
// Due-date emphasis on the Project card: past due = bold red, due within
// the next 3 days = red. Finished projects (completed/cancelled) are never
// flagged — a past due date on those isn't overdue work — and fall back to
// the card's normal muted text.
function dueDateClass(dueDate: Date, status: string): string {
  if (status === "COMPLETED" || status === "CANCELLED") return "text-soft";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (dueDate.getTime() < startOfToday.getTime()) return "font-bold text-red-600";
  if (dueDate.getTime() <= startOfToday.getTime() + 4 * 24 * 60 * 60 * 1000 - 1) return "text-red-600";
  return "text-soft";
}

const PROJECT_STATUS_COLORS: Record<string, string> = {
  PLANNING: "bg-black/5 text-soft",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ON_HOLD: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-sky-50 text-sky-700",
  CANCELLED: "bg-red-50 text-red-600",
};
const GENERAL_INFO_FIELD_SLUGS = new Set(["servicesrequired", "projectgoaldescription"]);

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
    <p className="break-words text-sm">
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
    <div className="min-w-0">
      <p className={LABEL_CLASS}>{label}</p>
      <p className="mt-1 break-words text-sm text-ink">{value || "—"}</p>
    </div>
  );
}

// The contact's photo if one was set (an uploaded/letter-avatar data URI or
// a Google-hosted URL), else a colored-circle initials placeholder — same
// fallback the avatar picker itself shows before a first choice is made.
function AvatarThumb({
  url,
  firstName,
  lastName,
  size = "h-14 w-14",
  textSize = "text-sm",
}: {
  url?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: string;
  textSize?: string;
}) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- either an external Google-hosted URL or a locally-generated data URI, not a local/optimizable asset
    return <img src={url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <div className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-black/10 ${textSize} font-semibold text-soft`}>
      {initialsFor(firstName, lastName)}
    </div>
  );
}

// Icon + app/platform name + ID (handle, username, or link) — the shared
// look for Instant messaging, Social media, and VoIP app rows.
function AppIdChip({
  platform,
  id,
  href,
  mobileHref,
}: {
  platform: string;
  id: string;
  href?: string;
  // A separate href used only on mobile (see app-deep-links.ts) — either a
  // custom app scheme with no web fallback (Skype/Viber/FaceTime), or the
  // same URL as `href` opened without target="_blank" so a mobile OS's
  // Universal/App Link handling can intercept it (which a new-tab open
  // doesn't reliably trigger). When set, this renders two chips — one
  // visible only below `sm`, one only at `sm` and up — instead of one.
  mobileHref?: string;
}) {
  const content = (
    <>
      <PlatformIcon platform={platform} className="h-4 w-4 shrink-0" />
      <span className="font-semibold">{platform}</span>
      <span className="min-w-0 truncate text-soft">{id}</span>
    </>
  );
  const className =
    "flex max-w-full items-center gap-1.5 rounded-full border border-card-border bg-field-bg px-3 py-1.5 text-xs font-medium text-ink";

  if (mobileHref) {
    return (
      <>
        <a href={mobileHref} className={`${className} hover:border-amo-gold sm:hidden`}>
          {content}
        </a>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className={`${className} hover:border-amo-gold hidden sm:flex`}>
            {content}
          </a>
        ) : (
          <span className={`${className} hidden sm:flex`}>{content}</span>
        )}
      </>
    );
  }

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className={`${className} hover:border-amo-gold`}>
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  );
}

// Wraps PhoneDisplay so the number auto-dials on mobile (tel:) while
// staying plain, non-clickable text on desktop — matching "on mobile,
// clicking a phone number should open the phone app" without adding a
// dead tel: link on a desktop browser that can't act on it.
function PhoneLine({ value, country }: { value?: string | null; country?: string | null }) {
  if (!value) return <PhoneDisplay value={value} country={country} />;
  return (
    <>
      <a href={telHref(value)} className="sm:hidden">
        <PhoneDisplay value={value} country={country} />
      </a>
      <span className="hidden sm:inline">
        <PhoneDisplay value={value} country={country} />
      </span>
    </>
  );
}

// A universal maps.google.com link — mobile browsers/webviews hand this off
// to the Google Maps app when it's installed (no separate deep-link scheme
// needed), and it just opens in the browser on desktop.
function googleMapsUrl(address?: string | null, city?: string | null, state?: string | null, zip?: string | null, country?: string | null): string {
  const query = [address, city, state, zip, country].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
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
    <div className="min-w-0">
      <h3 className={LABEL_CLASS}>{title}</h3>
      <div className="mt-2 text-sm text-ink">
        {isEmpty ? (
          <p className="text-soft">—</p>
        ) : (
          <a href={googleMapsUrl(address, city, state, zip, country)} target="_blank" rel="noreferrer" className="block hover:underline">
            {address && <p className="break-words">{address}</p>}
            {cityLine && <p className="break-words">{cityLine}</p>}
            {country && (
              <p className="inline-flex items-center gap-1.5">
                <CountryFlag country={country} /> {countryFullName(country)}
              </p>
            )}
          </a>
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
      <div className="min-w-0">
        <h4 className={LABEL_CLASS}>{title}</h4>
        <p className="mt-2 text-sm text-soft">—</p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <h4 className={LABEL_CLASS}>{title}</h4>
      <div className="mt-2 space-y-1 text-sm text-ink">
        {domain && <p className="break-words">{domain}</p>}
        {hostingProvider && (
          <p className="break-words text-soft">
            {t.contactForm.hostingProvider}: {hostingProvider}
          </p>
        )}
        {app && (
          <p className="break-words text-soft">
            {appLabel}: {app}
          </p>
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
    defaultComposeSource,
    addressColors,
    calendarEvents,
    calendarEventLinks,
    calendarContactOptions,
    calendarProjectOptions,
    calendarTaskOptions,
    calendarPhaseOptions,
    calendarBookingOptions,
    calendarProgramOptions,
    allTags,
    allContacts: allContactsForRelations,
    teamMembers,
    twilioReady,
  } = await withScopedPrismaClient(async (db) => {
    const googleAccessToken = session ? await getValidAccessToken(session.user.id, db) : null;
    const hour12 = await getHour12(session, db);
    const composePrefs = session
      ? await db.user.findUnique({ where: { id: session.user.id }, select: { defaultComposeSource: true } })
      : null;
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
            owner: true,
            supervisor: true,
          },
        },
        activity: { orderBy: { createdAt: "desc" }, take: 20, include: { user: true } },
        interactions: {
          orderBy: { occurredAt: "desc" },
          include: {
            loggedBy: true,
            updatedBy: true,
            project: true,
            participants: { include: { contact: true, user: true } },
          },
        },
        owner: true,
        subscriptions: { orderBy: { startedAt: "desc" } },
        courseEnrollments: { orderBy: { enrolledAt: "desc" } },
        communityMemberships: { orderBy: { joinedAt: "desc" } },
        emailLinks: { orderBy: { messageDate: "desc" } },
        socialLinks: { orderBy: { createdAt: "asc" } },
        extraAddresses: { orderBy: { order: "asc" } },
        messagingAccounts: { orderBy: { order: "asc" } },
        voipAccounts: { orderBy: { order: "asc" } },
        techStackItems: { orderBy: { order: "asc" } },
        domains: { orderBy: { order: "asc" } },
        credentials: { orderBy: { createdAt: "asc" } },
        appSyncSettings: true,
        relationsFrom: { include: { relatedContact: true }, orderBy: { createdAt: "asc" } },
        relationsTo: { include: { contact: true }, orderBy: { createdAt: "asc" } },
        contactNotes: { orderBy: { createdAt: "desc" } },
      },
    });
    // Some older links were saved with only a Gmail thread id and no
    // subject/sender/date snapshot, which the Linked emails card can only
    // show as "—". Fill those in from Gmail (and store them, so this is a
    // one-time cost per link). Sequential for the same Hyperdrive reason as
    // the reads around it; a thread this account can't read stays as is.
    if (contact && googleAccessToken) {
      const blank = contact.emailLinks.filter((l) => !l.subject && !l.gmailThreadId.startsWith("ionos:")).slice(0, 15);
      for (const link of blank) {
        const snap = await fetchGmailThreadSnapshot(googleAccessToken, link.gmailThreadId);
        if (!snap) continue;
        const messageDate = snap.date ? new Date(snap.date) : null;
        await db.emailLink.update({
          where: { id: link.id },
          data: { subject: snap.subject, fromLabel: snap.fromLabel, messageDate, gmailLink: snap.link },
        });
        Object.assign(link, { subject: snap.subject, fromLabel: snap.fromLabel, messageDate, gmailLink: snap.link });
      }
      if (blank.length > 0) {
        contact.emailLinks.sort((a, b) => (b.messageDate?.getTime() ?? 0) - (a.messageDate?.getTime() ?? 0));
      }
    }
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
      select: { id: true, firstName: true, lastName: true, company: true, email: true, extraEmails: true },
    });
    const allTags = await db.tag.findMany();
    const teamMembers = await db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
    const allProjects = await db.project.findMany({ orderBy: { name: "asc" }, take: 300, select: { id: true, name: true, contactId: true } });
    const allTasks = await db.task.findMany({
      where: { status: { not: "DONE" } },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true, projectId: true, phaseId: true },
    });
    const allPhases = await db.projectPhase.findMany({ orderBy: [{ projectId: "asc" }, { order: "asc" }], take: 800, select: { id: true, name: true, projectId: true } });
    const allBookings = await db.booking.findMany({
      orderBy: { scheduledFor: "desc" },
      take: 100,
      select: { id: true, eventName: true, contactName: true, scheduledFor: true, contactId: true },
    });
    const allPrograms = await db.affiliateProgram.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, extraEmails: true },
    });
    const addressColors = await db.emailAddressColor.findMany({ orderBy: { order: "asc" } });

    return {
      contact,
      hour12,
      defaultComposeSource: composePrefs?.defaultComposeSource ?? null,
      calendarEvents,
      calendarEventLinks,
      addressColors,
      calendarContactOptions: allContacts.map((c) => ({
        id: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "",
        email: c.email,
        extraEmails: c.extraEmails,
      })),
      calendarProjectOptions: allProjects.map((p) => ({ id: p.id, label: p.name, contactId: p.contactId })),
      calendarTaskOptions: allTasks.map((tk) => ({ id: tk.id, label: tk.title, projectId: tk.projectId, phaseId: tk.phaseId })),
      calendarPhaseOptions: allPhases.map((ph) => ({ id: ph.id, label: ph.name, projectId: ph.projectId })),
      calendarBookingOptions: allBookings,
      calendarProgramOptions: allPrograms.map((p) => ({ id: p.id, label: p.name, email: p.email, extraEmails: p.extraEmails })),
      allTags,
      allContacts,
      teamMembers,
      twilioReady: Boolean(await getTwilioConfig(db)),
    };
  });

  if (!contact) notFound();

  const isAdmin = session?.user.role === "ADMIN";
  // Planning/Active first, then On hold, then Completed/Cancelled — each
  // group by due date (soonest first, undated last).
  const projectGroup = (status: string) => (status === "ON_HOLD" ? 1 : status === "COMPLETED" || status === "CANCELLED" ? 2 : 0);
  const sortedProjects = [...contact.projects].sort(
    (a, b) =>
      projectGroup(a.status) - projectGroup(b.status) ||
      (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
      b.createdAt.getTime() - a.createdAt.getTime()
  );
  // Related contacts (either direction) for the Calls & SMS participants.
  const relatedContactOptions = [
    ...contact.relationsFrom.map((r) => r.relatedContact),
    ...contact.relationsTo.map((r) => r.contact),
  ]
    .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
    .map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company || "—" }));
  const credentialEntries = contact.credentials.map((c) => ({
    id: c.id,
    label: c.label,
    url: c.url,
    username: c.username,
    hasPassword: Boolean(c.passwordEncrypted),
    loginMethod: c.loginMethod,
    notes: c.notes,
  }));

  // updateContactRelations now mirrors every relation onto the other
  // contact with its reciprocal type (see reciprocalRelationType) — so
  // relationsFrom alone already covers every relationship this contact
  // saved from its own side, with the label reading correctly as-is.
  // relationsTo is still consulted as a fallback for relations that
  // predate that mirroring (or haven't been re-saved since), with the
  // label computed as its reciprocal since that row's own relationType
  // describes this contact, not the other one — then de-duped by other
  // contact so a fully-mirrored pair (now covered by relationsFrom) never
  // lists the same person twice.
  const relatedContactRowsRaw = [
    ...contact.relationsFrom.map((r) => ({
      id: r.id,
      otherId: r.relatedContactId,
      relationType: r.relationType,
      notes: r.notes,
      other: r.relatedContact,
    })),
    ...contact.relationsTo.map((r) => ({
      id: r.id,
      otherId: r.contactId,
      relationType: reciprocalRelationType(r.relationType),
      notes: r.notes,
      other: r.contact,
    })),
  ];
  const seenRelatedOtherIds = new Set<string>();
  const relatedContactRows = relatedContactRowsRaw.filter((row) => {
    if (seenRelatedOtherIds.has(row.otherId)) return false;
    seenRelatedOtherIds.add(row.otherId);
    return true;
  });

  const otherContactsForRelations = allContactsForRelations.filter((c) => c.id !== contact.id);

  const appSyncByApp = new Map(contact.appSyncSettings.map((row) => [row.app, row]));

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

  // Services required / Project goal description now display in the
  // General info card (below Website), not in this generic list.
  const otherFields = contact.fieldValues.filter(
    (fv) => !DUPLICATE_FIELD_SLUGS.has(normalizeSlug(fv.fieldSlug)) && !GENERAL_INFO_FIELD_SLUGS.has(normalizeSlug(fv.fieldSlug))
  );
  const servicesRequiredValue = contact.fieldValues.find((fv) => normalizeSlug(fv.fieldSlug) === "servicesrequired")?.value;
  const projectGoalValue = contact.fieldValues.find((fv) => normalizeSlug(fv.fieldSlug) === "projectgoaldescription")?.value;

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

  const birthdayInfo = formatBirthday(contact.birthday, lang);
  const birthdayLine = birthdayInfo ? (
    <>
      {birthdayInfo.display}
      {birthdayInfo.age != null && (
        <>
          <br />
          {t.contactForm.ageYearsOld(birthdayInfo.age)}
        </>
      )}
    </>
  ) : undefined;
  // Mobile-only compact jurisdiction field: region+country merged into one
  // line (e.g. "QC Canada", "NSW Australia") instead of the two separate
  // columns desktop has room for.
  const jurisdictionMobile = [contact.jurisdictionRegion, contact.jurisdictionCountry].filter(Boolean).join(" ") || undefined;

  return (
    // Mobile: main's own p-4 (see app-shell.tsx) puts a 16px gap between
    // this page's cards and both the sidebar and the right edge of the
    // screen — cancelled (-mx-4) and replaced with a tighter 8px (px-2),
    // same convention as the Dashboard/Marketing pages. Desktop (sm+) is
    // unaffected (mx-0/px-0 leaves main's own sm:p-8 as the only inset).
    <div className="-mx-4 space-y-2 px-2 sm:mx-0 sm:space-y-6 sm:px-0">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <AvatarThumb url={contact.avatarUrl} firstName={contact.firstName} lastName={contact.lastName} size="h-10 w-10" textSize="text-xs" />
            <span className="truncate">{fullName}</span>
          </span>
        }
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
        actions={<DeleteContactButton lang={lang} contactId={contact.id} />}
      />

      <div className="grid gap-2 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-2 sm:space-y-6 lg:col-span-2">
          <Card
            color="general"
            title={t.contactForm.cardGeneralInfo}
            compact
            actions={
              <GeneralInfoDialog
                action={updateContactGeneralInfo.bind(null, contact.id)}
                values={contact}
                lang={lang}
                hour12={hour12}
                contactId={contact.id}
                tags={contact.tags.map((ct) => ct.tag)}
                allTags={allTags}
              />
            }
          >
            {/* Desktop: explicit 4-row grid (Language has no row of its own in
                this layout — it rides at the end of row 2 rather than being
                dropped, since it's still real contact data). */}
            <div className="hidden gap-4 lg:grid lg:grid-cols-4">
              {/* Row 1 */}
              <InfoField label={t.contactForm.firstName} value={contact.firstName} />
              <InfoField label={t.contactForm.lastName} value={contact.lastName} />
              <InfoField label={t.contactForm.company} value={contact.company} />
              <InfoField label={t.contactForm.jobTitle} value={contact.jobTitle} />

              {/* Row 2 */}
              <InfoField label={t.contactForm.companyType} value={contact.companyType} />
              <InfoField label={t.contactForm.jurisdictionCountry} value={contact.jurisdictionCountry} />
              <InfoField
                label={`${stateLabelForCountry(contact.jurisdictionCountry ?? undefined, lang)} ${t.contactForm.ofJurisdiction}`}
                value={contact.jurisdictionRegion}
              />
              <InfoField label={t.contactForm.industry} value={contact.industry} />

              {/* Row 3 */}
              <div className="space-y-3">
                <InfoField label={t.contactForm.stage} value={STAGE_LABELS[contact.stage]} />
                <InfoField label={t.contactForm.language} value={languageDisplay(contact.locale, t)} />
              </div>
              <InfoField
                label={t.contactForm.timeZone}
                value={contact.timeZone ? `(${utcOffsetLabel(contact.timeZone)}) ${contact.timeZone.replace(/_/g, " ")}` : undefined}
              />
              <div className="flex flex-col justify-end">
                {contactTimeZone ? (
                  <LocalTimeCard timeZone={contactTimeZone} hour12={hour12} lang={lang} label={t.contactForm.timeZoneNow} />
                ) : null}
              </div>
              <TagManager contactId={contact.id} tags={contact.tags.map((ct) => ct.tag)} allTags={allTags} lang={lang} />

              {/* Row 4 — Website / Nickname / Birthday / picture (spans this row
                  and the next). Row 5 — Services required (left) and Project
                  goal (right) share one grid row so their labels line up. */}
              <InfoField
                label={t.contactForm.website}
                value={
                  contact.website ? (
                    <a href={contact.website} target="_blank" rel="noreferrer" className="break-words text-sky-700 hover:underline">
                      {contact.website}
                    </a>
                  ) : undefined
                }
              />
              <InfoField label={t.contactForm.nickname} value={contact.nickname} />
              <InfoField label={t.contactForm.birthday} value={birthdayLine} />
              <div className="row-span-2">
                <AvatarThumb url={contact.avatarUrl} firstName={contact.firstName} lastName={contact.lastName} size="h-28 w-28" textSize="text-2xl" />
              </div>
              <InfoField label={t.contactDetail.servicesRequiredLabel} value={servicesRequiredValue} />
              <InfoField label={t.contactDetail.projectGoalLabel} value={projectGoalValue} />
            </div>

            {/* Mobile: separate 7(+2)-row layout — a merged Jurisdiction field
                instead of desktop's two columns, plus Industry and Tags as
                trailing rows since the requested 7 rows didn't have room for
                them but they're still real data. */}
            <div className="grid grid-cols-2 gap-2 lg:hidden">
              <InfoField label={t.contactForm.firstName} value={contact.firstName} />
              <InfoField label={t.contactForm.lastName} value={contact.lastName} />

              <InfoField label={t.contactForm.company} value={contact.company} />
              <InfoField label={t.contactForm.jobTitle} value={contact.jobTitle} />

              <InfoField label={t.contactForm.companyType} value={contact.companyType} />
              <InfoField label={t.contactForm.jurisdictionShort} value={jurisdictionMobile} />

              <InfoField label={t.contactForm.language} value={languageDisplay(contact.locale, t)} />
              <InfoField label={t.contactForm.stage} value={STAGE_LABELS[contact.stage]} />

              <InfoField
                label={t.contactForm.timeZone}
                value={contact.timeZone ? `(${utcOffsetLabel(contact.timeZone)}) ${contact.timeZone.replace(/_/g, " ")}` : undefined}
              />
              <div className="flex flex-col justify-end">
                {contactTimeZone ? (
                  <LocalTimeCard timeZone={contactTimeZone} hour12={hour12} lang={lang} label={t.contactForm.timeZoneNow} />
                ) : null}
              </div>

              <div className="space-y-2">
                <InfoField
                  label={t.contactForm.website}
                  value={
                    contact.website ? (
                      <a href={contact.website} target="_blank" rel="noreferrer" className="break-words text-sky-700 hover:underline">
                        {contact.website}
                      </a>
                    ) : undefined
                  }
                />
                <InfoField label={t.contactDetail.servicesRequiredLabel} value={servicesRequiredValue} />
                <InfoField label={t.contactDetail.projectGoalLabel} value={projectGoalValue} />
              </div>
              <InfoField label={t.contactForm.nickname} value={contact.nickname} />

              <InfoField label={t.contactForm.birthday} value={birthdayLine} />
              <div>
                <AvatarThumb url={contact.avatarUrl} firstName={contact.firstName} lastName={contact.lastName} size="h-28 w-28" textSize="text-2xl" />
              </div>

              <div className="col-span-2">
                <InfoField label={t.contactForm.industry} value={contact.industry} />
              </div>
              <div className="col-span-2">
                <TagManager contactId={contact.id} tags={contact.tags.map((ct) => ct.tag)} allTags={allTags} lang={lang} />
              </div>
            </div>
          </Card>

          <Card
            color="contact"
            title={t.contactForm.cardContactInfo}
            compact
            actions={
              <ContactInfoDialog
                action={updateContactInfo.bind(null, contact.id)}
                values={{ ...contact, messagingAccounts: contact.messagingAccounts }}
                lang={lang}
              />
            }
          >
            <div className="grid grid-cols-1 gap-2 sm:gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.7fr)_minmax(0,1.9fr)]">
              <div className="min-w-0">
                <p className={LABEL_CLASS}>{t.contactForm.emails}</p>
                <div className="mt-1 space-y-0.5 text-sm text-ink">
                  <ContactEmailLinks
                    emails={[contact.email, contact.email2, ...contact.extraEmails].filter((e): e is string => Boolean(e))}
                    defaultComposeSource={defaultComposeSource}
                    dateLocale={dateLocale}
                    intlLocale={intlLocale}
                    hour12={hour12}
                    emailComposeLabels={t.emailCompose}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <p className={LABEL_CLASS}>{t.contactDetail.fieldPhones}</p>
                <div className="mt-1 space-y-0.5 text-sm text-ink">
                  <p>
                    <PhoneLine value={contact.phone} country={contact.country} />
                  </p>
                  {contact.phone2 && (
                    <p>
                      <PhoneLine value={contact.phone2} country={contact.country} />
                    </p>
                  )}
                  {contact.extraPhones.map((phone) => (
                    <p key={phone}>
                      <PhoneLine value={phone} country={contact.country} />
                    </p>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <p className={LABEL_CLASS}>{t.contactForm.messagingAppsTitle}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {contact.messagingAccounts.length === 0 && <p className="text-sm text-soft">—</p>}
                  {contact.messagingAccounts.map((row) => {
                    const link = messagingAppLink(row.app, row.handle);
                    return (
                      <AppIdChip
                        key={row.id}
                        platform={row.app}
                        id={row.handle}
                        href={link && !link.mobileOnly ? link.href : undefined}
                        mobileHref={link?.href}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <Card
              color="social"
              title={t.contactForm.cardSocialMedia}
              compact
              actions={<SocialDialog action={updateContactSocial.bind(null, contact.id)} socialLinks={contact.socialLinks} lang={lang} />}
            >
              <div className="flex flex-wrap gap-1.5">
                {contact.socialLinks.length === 0 && <p className="text-sm text-soft">—</p>}
                {contact.socialLinks.map((link) => (
                  <AppIdChip key={link.id} platform={link.platform} id={link.url} href={link.url} mobileHref={link.url} />
                ))}
              </div>
            </Card>
            <Card
              color="voip"
              title={t.contactForm.cardVoipApps}
              compact
              actions={<VoipDialog action={updateContactVoip.bind(null, contact.id)} voipAccounts={contact.voipAccounts} lang={lang} />}
            >
              <div className="flex flex-wrap gap-1.5">
                {contact.voipAccounts.length === 0 && <p className="text-sm text-soft">—</p>}
                {contact.voipAccounts.map((row) => {
                  const link = voipAppLink(row.app, row.handle);
                  return (
                    <AppIdChip
                      key={row.id}
                      platform={row.app}
                      id={row.handle}
                      href={link && !link.mobileOnly ? link.href : undefined}
                      mobileHref={link?.href}
                    />
                  );
                })}
              </div>
            </Card>
          </div>

          <Card
            color="addresses"
            title={t.contactForm.cardAddresses}
            compact
            actions={<AddressesDialog action={updateContactAddresses.bind(null, contact.id)} values={contact} lang={lang} />}
          >
            <div className="grid gap-2 sm:gap-4 lg:grid-cols-2">
              <div className="space-y-2 sm:space-y-4">
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
                    title={addr.description || t.contactDetail.additionalAddressTitle}
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

          <Card
            color="billing"
            title={t.contactForm.cardInvoice}
            compact
            actions={<InvoiceDialog action={updateContactInvoice.bind(null, contact.id)} values={contact} lang={lang} />}
          >
            <p className="text-sm text-ink">
              {contact.autoSendInvoiceReminders ? t.contactDetail.invoiceRemindersAuto : t.contactDetail.invoiceRemindersManual}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
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
          </Card>

          <Card
            color="techStack"
            title={t.contactForm.techStackTitle}
            compact
            actions={<TechStackDialog action={updateContactTechStack.bind(null, contact.id)} values={contact} lang={lang} />}
          >
            <div className="grid grid-cols-2 gap-2 sm:gap-6 lg:grid-cols-4">
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

          <Card
            color="domains"
            title={t.contactForm.cardDomains}
            compact
            actions={<DomainsDialog action={updateContactDomains.bind(null, contact.id)} domains={contact.domains} lang={lang} />}
          >
            {contact.domains.length === 0 ? (
              <p className="text-sm text-soft">—</p>
            ) : (
              <ul className="divide-y divide-card-border">
                {contact.domains.map((d) => (
                  <li key={d.id} className="py-2 text-sm first:pt-0">
                    <p className="font-medium text-ink">{d.domain}</p>
                    <p className="text-xs text-soft">
                      {(
                        [
                          d.registrar ? [t.contactForm.registrar, d.registrar] : null,
                          d.dnsProvider ? [t.contactForm.dnsProvider, d.dnsProvider] : null,
                          d.expiryDate ? [t.contactForm.expiryDate, format(d.expiryDate, "PP", { locale: dateLocale })] : null,
                          d.managedBy ? [t.contactForm.managedBy, d.managedBy] : null,
                        ].filter(Boolean) as [string, string][]
                      ).map(([label, value], i) => (
                        <span key={label}>
                          {i > 0 && " · "}
                          <span className="uppercase tracking-wide text-ink">{label}:</span> {value}
                        </span>
                      ))}
                      {d.autoRenew && (
                        <>
                          {(d.registrar || d.dnsProvider || d.expiryDate || d.managedBy) && " · "}
                          {t.contactForm.autoRenew}
                        </>
                      )}
                    </p>
                    {d.notes && <p className="text-xs text-soft">{d.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {isAdmin && <ContactCredentialsCard contactId={contact.id} entries={credentialEntries} lang={lang} />}

          {otherContactsForRelations.length > 0 && (
            <Card
              color="relations"
              title={t.contactForm.cardRelatedContacts}
              compact
              actions={
                <RelationsDialog
                  action={updateContactRelations.bind(null, contact.id)}
                  relations={contact.relationsFrom.map((r) => ({ relatedContactId: r.relatedContactId, relationType: r.relationType, notes: r.notes }))}
                  allContacts={otherContactsForRelations}
                  lang={lang}
                />
              }
            >
              {relatedContactRows.length === 0 ? (
                <p className="text-sm text-soft">—</p>
              ) : (
                <ul className="divide-y divide-card-border">
                  {relatedContactRows.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 py-2 text-sm first:pt-0">
                      <Link href={`/contacts/${row.other.id}`} className="font-medium text-ink hover:underline">
                        {[row.other.firstName, row.other.lastName].filter(Boolean).join(" ") || row.other.company || row.other.email || row.other.id}
                      </Link>
                      <span className="text-xs text-soft">{row.relationType}</span>
                      {row.notes && <span className="text-xs text-soft">· {row.notes}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card
            color="other"
            title={t.contactForm.cardOtherInfo}
            compact
            actions={<OtherInfoDialog action={updateContactOtherInfo.bind(null, contact.id)} values={contact} lang={lang} />}
          >
            <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-3">
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
              {CONTACT_SYNC_APPS.map((def) => {
                const row = appSyncByApp.get(def.app);
                const enabled = row ? row.enabled : def.app === "google_contacts" || Boolean(contact.systemeIoId && def.app === "systeme_io");
                if (!enabled) return null;
                const appLabel = t.contactForm.syncAppLabels[def.labelKey as keyof typeof t.contactForm.syncAppLabels] ?? def.app;
                // The contact's own lastSyncedAt column predates per-app
                // rows and is what the systeme.io sync has always written.
                const syncedAt = row?.lastSyncedAt ?? (def.app === "systeme_io" ? contact.lastSyncedAt : null);
                return (
                  <InfoField
                    key={def.app}
                    label={`${t.contactDetail.lastSyncedPrefix} · ${appLabel}`}
                    value={syncedAt ? formatDistanceToNow(syncedAt, { addSuffix: true, locale: dateLocale }) : undefined}
                  />
                );
              })}
            </div>
            {otherFields.length > 0 && (
              <div className="grid gap-2 sm:gap-4 sm:grid-cols-2">
                {otherFields.map((fv) => (
                  <InfoField key={fv.id} label={fieldLabel(fv, t)} value={fv.value} />
                ))}
              </div>
            )}

            <div className="rounded-lg border border-card-border bg-black/[0.02] p-2 sm:p-4">
              <h3 className={LABEL_CLASS}>{t.contactForm.appSyncTitle}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {CONTACT_SYNC_APPS.map((def) => {
                  const row = appSyncByApp.get(def.app);
                  const enabled = row ? row.enabled : def.app === "google_contacts" || Boolean(contact.systemeIoId && def.app === "systeme_io");
                  const label = t.contactForm.syncAppLabels[def.labelKey as keyof typeof t.contactForm.syncAppLabels] ?? def.app;
                  return (
                    <span
                      key={def.app}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-soft"}`}
                    >
                      {label}
                      {enabled && row ? ` · ${row.direction === "BOTH" ? t.contactForm.syncDirectionBoth : row.direction === "TO_APP" ? t.contactForm.syncDirectionToApp : t.contactForm.syncDirectionFromApp}` : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card
            color="notes"
            title={t.contactForm.cardNotes}
            compact
            actions={
              <NotesDialog
                action={updateContactNotes.bind(null, contact.id)}
                notes={contact.contactNotes.map((n) => ({ id: n.id, text: n.text }))}
                lang={lang}
              />
            }
          >
            {contact.contactNotes.length === 0 ? (
              <p className="text-sm text-soft">—</p>
            ) : (
              <ul className="divide-y divide-card-border">
                {contact.contactNotes.map((note) => (
                  <li key={note.id} className="py-2 text-sm first:pt-0">
                    <p className="whitespace-pre-wrap break-words text-ink">{note.text}</p>
                    <NoteTimestamps createdAt={note.createdAt.toISOString()} updatedAt={note.updatedAt.toISOString()} lang={lang} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

        </div>

        <div className="min-w-0 space-y-2 sm:space-y-6">
          <div id="projects">
            <Card
              color="projects"
              title={
                <>
                  {t.contactDetail.projectsTitle}
                  {contact.projects.length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">
                      {contact.projects.length}
                    </span>
                  )}
                </>
              }
              compact
              flushTop
              actions={
                <Link
                  href={`/projects/new?contactId=${contact.id}`}
                  title={t.contactDetail.newProject}
                  aria-label={t.contactDetail.newProject}
                  className="flex h-5 w-5 items-center justify-center rounded text-lg font-bold leading-none text-white hover:bg-white/20"
                >
                  +
                </Link>
              }
            >
              {contact.projects.length === 0 ? (
                <p className="pt-2 text-sm text-soft">{t.contactDetail.noProjectsYet}</p>
              ) : (
                <ul className="divide-y divide-card-border">
                  {sortedProjects.map((project) => (
                    <li key={project.id}>
                      {/* The whole row is the link, not just the name. */}
                      <Link href={`/projects/${project.id}`} className="-mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-2 hover:bg-black/5">
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium text-ink">{project.name}</p>
                          <p className="text-xs text-soft">
                            <span className="uppercase tracking-wide text-ink">{t.projectForm.typeShort}:</span> {t.projectTypes[project.type]}
                          </p>
                          {project.owner && (
                            <p className="text-xs text-soft">
                              <span className="uppercase tracking-wide text-ink">{t.projectForm.owner}:</span> {project.owner.name}
                            </p>
                          )}
                          {project.supervisor && (
                            <p className="text-xs text-soft">
                              <span className="uppercase tracking-wide text-ink">{t.projectForm.supervisor}:</span> {project.supervisor.name}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 space-y-1 text-right">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${PROJECT_STATUS_COLORS[project.status]}`}>
                            {t.projectStatuses[project.status]}
                          </span>
                          {project.dueDate && (
                            <p className={`text-xs ${dueDateClass(project.dueDate, project.status)}`}>
                              <span className={`uppercase tracking-wide ${dueDateClass(project.dueDate, project.status) === "text-soft" ? "text-ink" : ""}`}>{t.projectForm.dueDate}:</span>
                              <br />
                              {format(project.dueDate, "PP", { locale: dateLocale })}
                            </p>
                          )}
                        </div>
                      </Link>
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
            phases={calendarPhaseOptions}
            bookings={calendarBookingLabelOptions}
            programs={calendarProgramOptions}
            noEventsLabel={t.calendarApp.noLinkedEvents}
            hour12={hour12}
            intlLocale={intlLocale}
            lang={lang}
            eventDialogLabels={t.eventDialog}
            eventViewDialogLabels={t.eventViewDialog}
            linkPickerLabels={calendarLinkPickerLabels}
            newEventLinks={{ contactId: contact.id }}
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
            compact
            actions={
              <NewEmailButton
                email={contact.email ?? contact.email2 ?? contact.extraEmails[0] ?? null}
                defaultComposeSource={defaultComposeSource}
                lang={lang}
                intlLocale={intlLocale}
                hour12={hour12}
                emailComposeLabels={t.emailCompose}
                title={t.emailCompose.newTitle}
              />
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
                myAddress: link.myAddress,
                contactId: link.contactId,
                projectId: link.projectId,
                phaseId: link.phaseId,
                taskId: link.taskId,
                affiliateProgramId: link.affiliateProgramId,
              }))}
              linkOptions={{
                contacts: calendarContactOptions,
                projects: calendarProjectOptions,
                tasks: calendarTaskOptions,
                phases: calendarPhaseOptions,
                programs: calendarProgramOptions,
                labels: {
                  link: t.linkPicker.link,
                  edit: t.linkPicker.edit,
                  none: t.linkPicker.none,
                  contact: t.linkPicker.contact,
                  project: t.linkPicker.project,
                  task: t.linkPicker.task,
                  phase: t.linkPicker.phase,
                  booking: t.linkPicker.booking,
                  affiliateProgram: t.linkPicker.affiliateProgram,
                  save: t.linkPicker.save,
                  saving: t.linkPicker.saving,
                  cancel: t.linkPicker.cancel,
                  clear: t.linkPicker.clear,
                  title: t.linkPicker.titleWithAffiliateProgram,
                  searchPlaceholder: t.linkPicker.searchPlaceholder,
                  noResults: t.linkPicker.noResults,
                },
              }}
              addressColors={addressColors}
              noLinkedEmailsLabel={t.contactDetail.noLinkedEmails}
              lang={lang}
              intlLocale={intlLocale}
              hour12={hour12}
              emailDialogLabels={t.emailDialog}
              emailComposeLabels={t.emailCompose}
            />
          </Card>

          <CallsSmsCard
            title={t.contactDetail.callsEmails}
            contactId={contact.id}
            contact={{ id: contact.id, name: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.company || contact.email || "—" }}
            relatedContacts={relatedContactOptions}
            teamMembers={teamMembers.map((u) => ({ id: u.id, name: u.name }))}
            linkData={{
              projects: calendarProjectOptions.map((p) => ({ id: p.id, name: p.label, contactId: p.contactId ?? null })),
              phases: calendarPhaseOptions.map((ph) => ({ id: ph.id, name: ph.label, projectId: ph.projectId ?? "" })),
              tasks: calendarTaskOptions.map((tk) => ({ id: tk.id, name: tk.label, projectId: tk.projectId ?? "", phaseId: tk.phaseId ?? null })),
            }}
            currentUserId={session?.user.id ?? null}
            sending={{ ready: twilioReady, numbers: contactPhoneOptions(contact) }}
            lang={lang}
            entries={contact.interactions.map((i) => ({
              id: i.id,
              type: i.type,
              subject: i.subject,
              notes: i.notes,
              occurredAt: i.occurredAt.toISOString(),
              durationMinutes: i.durationMinutes,
              createdAt: i.createdAt.toISOString(),
              updatedAt: i.updatedAt.toISOString(),
              createdBy: i.loggedBy?.name ?? null,
              updatedBy: i.updatedBy?.name ?? null,
              contactId: i.contactId,
              projectId: i.projectId,
              phaseId: i.phaseId,
              taskId: i.taskId,
              direction: i.direction,
              deliveryStatus: i.deliveryStatus,
              externalNumber: i.externalNumber,
              errorCode: i.errorCode,
              seenAt: i.seenAt ? i.seenAt.toISOString() : null,
              participants: i.participants.map((p) =>
                p.contact
                  ? { kind: "contact" as const, id: p.contact.id, name: [p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || p.contact.company || "—" }
                  : { kind: "user" as const, id: p.user?.id ?? "", name: p.user?.name ?? "—" }
              ),
            }))}
          />

          <Card color="purchases" title={t.contactDetail.purchasesTitle} compact>
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
            compact
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
            compact
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

          <Card color="activity" title={t.contactDetail.systemActivity} compact>
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
