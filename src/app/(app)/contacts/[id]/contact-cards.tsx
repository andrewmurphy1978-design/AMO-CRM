import { format } from "date-fns";
import type { Prisma } from "@prisma/client";
import Card from "@/components/section-card";
import PhoneDisplay from "@/components/phone-display";
import PlatformIcon from "@/components/platform-icon";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { telHref, messagingAppLink } from "@/lib/app-deep-links";
import { initialsFor } from "@/lib/avatar";
import ContactEmailLinks from "./contact-email-links";
import ContactInfoDialog from "./contact-info-dialog";
import TechStackDialog from "./tech-stack-dialog";
import DomainsDialog from "./domains-dialog";
import { updateContactInfo, updateContactTechStack, updateContactDomains } from "@/actions/contact-sections";

// Cards shared by the Contact page and the Project page (which shows the
// client's Contact Info in a header drop-down, and Tech Stack / Domains
// under the tasks).

const LABEL_CLASS = "text-xs font-semibold uppercase tracking-wide text-soft";

export type ContactWithDetails = Prisma.ContactGetPayload<{
  include: { messagingAccounts: true; techStackItems: true; domains: true };
}>;

// The contact's photo if one was set (an uploaded/letter-avatar data URI or
// a Google-hosted URL), else a colored-circle initials placeholder — same
// fallback the avatar picker itself shows before a first choice is made.
export function AvatarThumb({
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
export function AppIdChip({
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
export function PhoneLine({ value, country }: { value?: string | null; country?: string | null }) {
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

export function ContactInfoCard({
  contact,
  lang,
  defaultComposeSource,
  hour12,
}: {
  contact: ContactWithDetails;
  lang: Lang;
  defaultComposeSource: string | null;
  hour12: boolean;
}) {
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";
  return (
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
  );
}

export function TechStackCard({ contact, lang }: { contact: ContactWithDetails; lang: Lang }) {
  const t = getDict(lang);
  return (
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
  );
}

export function DomainsCard({ contact, lang }: { contact: ContactWithDetails; lang: Lang }) {
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  return (
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
  );
}
