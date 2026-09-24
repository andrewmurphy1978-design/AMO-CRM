import Link from "next/link";
import type { ContactStage } from "@prisma/client";
import { tagKind, TAG_KIND_COLORS, isLanguageTag } from "@/lib/tag-colors";
import CountryFlag from "@/components/country-flag";
import PhoneDisplay from "@/components/phone-display";

// Same stripe colors as the Contacts list itself (contacts/page.tsx) — kept
// as its own small copy rather than a shared export since nothing else
// needs them and the two lists are visually independent.
const LIGHT_ROW_BG = "#dce8e0";
const ALT_ROW_BG = "#7fa898";

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-emerald-50 text-emerald-700",
  PROSPECT: "bg-teal-50 text-teal-700",
  CLIENT: "bg-sky-50 text-sky-700",
  PAST_CLIENT: "bg-red-200 text-red-900",
  UNSUBSCRIBED: "bg-red-50 text-red-600",
  PERSONAL: "bg-violet-50 text-violet-700",
};

// One accent color per bucket, same idea as EMAIL_SECTION_COLORS on the
// Email card — kept local since nothing else uses these three.
const SECTION_COLORS: Record<"TODAY" | "YESTERDAY" | "THIS_WEEK", { headerBg: string; headerText: string; badgeBg: string; badgeText: string }> = {
  TODAY: { headerBg: "bg-emerald-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  YESTERDAY: { headerBg: "bg-sky-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
  THIS_WEEK: { headerBg: "bg-violet-500", headerText: "text-white", badgeBg: "bg-white/25", badgeText: "text-white" },
};

// Rows beyond this count scroll instead of growing the section — each row
// measures exactly 111px, so these are exactly 2 (today/yesterday) and 5
// (this week) rows tall.
const ROW_HEIGHT = 111;
const MAX_HEIGHT_SMALL = ROW_HEIGHT * 2;
const MAX_HEIGHT_LARGE = ROW_HEIGHT * 5;

export interface NewContactRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  country: string | null;
  stage: ContactStage;
  email: string | null;
  phone: string | null;
  source: string | null;
  tags: { tagId: string; tag: { name: string } }[];
}

export interface NewContactsCardLabels {
  title: string;
  openContacts: string;
  today: string;
  yesterday: string;
  thisWeek: string;
  noneYet: string;
}

function ContactIcon({ avatarUrl }: { avatarUrl: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />;
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 shrink-0 text-soft">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.964 0a9 9 0 1 0-11.964 0m11.964 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

// Same row markup as the Contacts page's own mobile card (contacts/page.tsx)
// — name + flag, stage + language pill, email, phone + source — so a
// contact looks identical here and there.
function ContactRow({ contact, stageLabels, bg }: { contact: NewContactRow; stageLabels: Record<string, string>; bg: string }) {
  const languageTags = contact.tags.filter((ct) => isLanguageTag(ct.tag.name));
  return (
    <Link href={`/contacts/${contact.id}`} className="block px-3 py-1.5" style={{ backgroundColor: bg }}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-ink">
          <ContactIcon avatarUrl={contact.avatarUrl} />
          <span className="truncate">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</span>
        </p>
        {contact.country && <CountryFlag country={contact.country} />}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}>{stageLabels[contact.stage]}</span>
        {languageTags[0] && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TAG_KIND_COLORS[tagKind(languageTags[0].tag.name)]}`}>
            {languageTags[0].tag.name}
          </span>
        )}
      </div>
      <p className="mt-1 truncate text-sm text-ink/70">{contact.email}</p>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm text-ink/70">
          <PhoneDisplay value={contact.phone} country={contact.country} />
        </p>
        <span className="shrink-0 text-xs text-ink/70">{contact.source ?? "—"}</span>
      </div>
    </Link>
  );
}

function Section({
  kind,
  label,
  contacts,
  stageLabels,
  maxHeight,
}: {
  kind: "TODAY" | "YESTERDAY" | "THIS_WEEK";
  label: string;
  contacts: NewContactRow[];
  stageLabels: Record<string, string>;
  maxHeight: number;
}) {
  if (contacts.length === 0) return null;
  const colors = SECTION_COLORS[kind];
  return (
    <section className="shrink-0 overflow-hidden rounded-xl border border-card-border">
      <div className={`flex items-center gap-2 px-3 py-2 ${colors.headerBg}`}>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${colors.headerText}`}>{label}</h3>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.badgeBg} ${colors.badgeText}`}>{contacts.length}</span>
      </div>
      <ul className="divide-y divide-card-border overflow-y-auto bg-card-bg" style={{ maxHeight }}>
        {contacts.map((contact, i) => (
          <li key={contact.id}>
            <ContactRow contact={contact} stageLabels={stageLabels} bg={i % 2 === 0 ? LIGHT_ROW_BG : ALT_ROW_BG} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function NewContactsCard({
  today,
  yesterday,
  thisWeek,
  stageLabels,
  labels,
}: {
  today: NewContactRow[];
  yesterday: NewContactRow[];
  thisWeek: NewContactRow[];
  stageLabels: Record<string, string>;
  labels: NewContactsCardLabels;
}) {
  const nothingToShow = today.length === 0 && yesterday.length === 0 && thisWeek.length === 0;

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <div className="relative flex shrink-0 items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <Link
          href="/contacts"
          title={labels.openContacts}
          aria-label={labels.openContacts}
          className="btn-primary absolute left-1/2 flex -translate-x-1/2 items-center justify-center rounded-lg p-1.5 shadow-sm sm:px-3 sm:py-1.5 sm:text-xs sm:font-semibold"
        >
          {/* Mobile: bare icon, same convention as the Email/Calendar cards'
              own header actions. Desktop/tablet (sm+) keeps the label. */}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-3.5 w-3.5 shrink-0 sm:hidden">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
            />
          </svg>
          <span className="hidden sm:inline">{labels.openContacts}</span>
        </Link>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {nothingToShow && <p className="text-sm text-soft">{labels.noneYet}</p>}
        <Section kind="TODAY" label={labels.today} contacts={today} stageLabels={stageLabels} maxHeight={MAX_HEIGHT_SMALL} />
        <Section kind="YESTERDAY" label={labels.yesterday} contacts={yesterday} stageLabels={stageLabels} maxHeight={MAX_HEIGHT_SMALL} />
        <Section kind="THIS_WEEK" label={labels.thisWeek} contacts={thisWeek} stageLabels={stageLabels} maxHeight={MAX_HEIGHT_LARGE} />
      </div>
    </div>
  );
}
