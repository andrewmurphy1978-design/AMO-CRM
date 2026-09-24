import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getHour12 } from "@/lib/time-format";
import PageHeader from "../page-header";
import { tagKind, TAG_KIND_COLORS, sortTags, isLanguageTag } from "@/lib/tag-colors";
import { countryFullName } from "@/lib/country-flag";
import CountryFlag from "@/components/country-flag";
import PhoneDisplay from "@/components/phone-display";
import ContactFilters from "./filters";
import ScrollableList from "./scrollable-list";
import DeleteToast from "./delete-toast";

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-emerald-50 text-emerald-700",
  PROSPECT: "bg-teal-50 text-teal-700",
  CLIENT: "bg-sky-50 text-sky-700",
  PAST_CLIENT: "bg-red-200 text-red-900",
  UNSUBSCRIBED: "bg-red-50 text-red-600",
  PERSONAL: "bg-violet-50 text-violet-700",
};

// Contacts list row stripe — same dark shade as the app-wide "#7fa898"
// alternate row (Projects/Invoices/Tasks), but the light stripe here is a
// touch lighter than their shared "#f4faf6" so the stage/tag pills' own
// pastel colors (bg-emerald-50, bg-sky-50, etc.) read clearly against it.
const LIGHT_ROW_BG = "#f8fbf9";
const ALT_ROW_BG = "#7fa898";

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Same chevron glyphs as the Calendar page's Previous/Next buttons
// (calendar-shell.tsx), for a consistent arrow style app-wide.
function PrevArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function NextArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// Mobile contact card: the contact's own photo when there is one, otherwise
// a generic person glyph — either way, a fixed-size marker before the name.
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

type SortField = "name" | "country" | "stage" | "source";
const SORT_FIELDS: SortField[] = ["name", "country", "stage", "source"];
const PAGE_SIZE = 100;

function SortableHeader({
  field,
  label,
  sortField,
  sortDir,
  baseParams,
}: {
  field: SortField;
  label: string;
  sortField: SortField | null;
  sortDir: "asc" | "desc";
  baseParams: URLSearchParams;
}) {
  const active = sortField === field;
  const nextDir = active && sortDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams(baseParams);
  params.set("sort", field);
  params.set("dir", nextDir);
  return (
    <th className="px-4 py-3">
      <Link href={`/contacts?${params.toString()}`} className="inline-flex items-center gap-1 hover:underline">
        {label}
        <span className="text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </Link>
    </th>
  );
}

function TagPills({ tags, vertical }: { tags: { tagId: string; tag: { name: string } }[]; vertical?: boolean }) {
  return (
    <div className={vertical ? "flex flex-col items-start gap-1" : "flex flex-wrap gap-1"}>
      {sortTags(tags).map((ct) => (
        <span
          key={ct.tagId}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${TAG_KIND_COLORS[tagKind(ct.tag.name)]}`}
        >
          {ct.tag.name}
        </span>
      ))}
    </div>
  );
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string | string[];
    tag?: string | string[];
    sort?: string;
    dir?: string;
    page?: string;
    deleted?: string;
  }>;
}) {
  const { q, stage, tag, sort, dir, page: pageParam, deleted } = await searchParams;
  const stages = toArray(stage);
  const selectedTags = toArray(tag);
  const sortField: SortField | null = SORT_FIELDS.includes(sort as SortField) ? (sort as SortField) : null;
  const sortDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
  const requestedPage = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const session = await auth();
  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const STAGE_LABELS = t.stages;

  const where: Prisma.ContactWhereInput = {};
  if (stages.length > 0) where.stage = { in: stages } as Prisma.ContactWhereInput["stage"];
  if (selectedTags.length > 0) where.tags = { some: { tag: { name: { in: selectedTags } } } };
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  let orderBy: Prisma.ContactOrderByWithRelationInput | Prisma.ContactOrderByWithRelationInput[] = { createdAt: "desc" };
  if (sortField === "name") orderBy = [{ lastName: sortDir }, { firstName: sortDir }];
  else if (sortField === "country") orderBy = { country: sortDir };
  else if (sortField === "stage") orderBy = { stage: sortDir };
  else if (sortField === "source") orderBy = { source: sortDir };

  // One shared client for all four reads below — see src/lib/prisma.ts
  // for why (each `prisma.x` property access on the raw proxy opens a
  // brand-new connection; several of those on this frequently-visited page
  // was a real contributor to Cloudflare's Error 1102).
  const { contacts, total, page, tags, hour12 } = await withScopedPrismaClient(async (db) => {
    const total = await db.contact.count({ where });
    // Clamped against the count before fetching, so a stale/out-of-range
    // page param (e.g. a bookmarked link from before a filter narrowed the
    // results) shows the last real page of contacts instead of an empty one.
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const contacts = await db.contact.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { tags: { include: { tag: true } } },
    });
    const tags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const hour12 = await getHour12(session, db);
    return { contacts, total, page, tags, hour12 };
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const stageOptions = Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }));
  const tagOptions = tags.map((tg) => ({ value: tg.name, label: tg.name }));

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  for (const s of stages) baseParams.append("stage", s);
  for (const tg of selectedTags) baseParams.append("tag", tg);

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams(baseParams);
    if (sortField) {
      params.set("sort", sortField);
      params.set("dir", sortDir);
    }
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/contacts?${params.toString()}`;
  }

  const paginationInfo = (
    <>
      {totalPages > 1 && (
        <div className="ml-auto flex items-center gap-2 text-sm">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              aria-label={t.contacts.previousPage}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-ink hover:bg-black/5"
            >
              <PrevArrowIcon />
            </Link>
          ) : (
            <span aria-label={t.contacts.previousPage} className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-soft opacity-50">
              <PrevArrowIcon />
            </span>
          )}
          <span className="text-soft">{t.contacts.pageOf(page, totalPages)}</span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              aria-label={t.contacts.nextPage}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-ink hover:bg-black/5"
            >
              <NextArrowIcon />
            </Link>
          ) : (
            <span aria-label={t.contacts.nextPage} className="flex h-8 w-8 items-center justify-center rounded-lg border border-card-border text-soft opacity-50">
              <NextArrowIcon />
            </span>
          )}
        </div>
      )}
      <span className={`rounded-full bg-amo-lime/15 px-3 py-1.5 text-sm font-semibold text-emerald-800 ${totalPages > 1 ? "" : "ml-auto"}`}>
        {t.contacts.shownRange(rangeStart, rangeEnd, total)}
      </span>
    </>
  );

  return (
    // Mobile: a tighter gap-2 rhythm throughout (most noticeably between
    // the header and the filter row, which used to sit a full 24px below
    // it for no reason) — desktop keeps the original spacious gap-6.
    <div className="flex flex-col gap-2 sm:gap-6">
      <DeleteToast message={deleted} />
      <PageHeader
        title={t.contacts.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          <Link
            href="/contacts/new"
            title={t.contacts.newContact}
            aria-label={t.contacts.newContact}
            className="btn-primary flex items-center justify-center rounded-lg p-1.5 shadow-sm sm:justify-start sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:font-semibold"
          >
            {/* Same Add-button convention as Email/Calendar: a bare square
                icon on mobile, label restored at sm+. */}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">{t.contacts.newContact}</span>
          </Link>
        }
      />

      <ContactFilters
        q={q ?? ""}
        stageOptions={stageOptions}
        tagOptions={tagOptions}
        selectedStages={stages}
        selectedTags={selectedTags}
        searchPlaceholder={t.contacts.searchPlaceholder}
        allStagesLabel={t.contacts.allStages}
        allTagsLabel={t.contacts.allTags}
        trailing={paginationInfo}
      />

      {/* Mobile only: the filter row has no room left for the pager/shown
          pill, so it repeats here, on its own line right below the fields
          (ContactFilters renders the same `trailing` node on desktop instead,
          at the end of the filter row). */}
      <div className="flex items-center gap-2 sm:hidden">{paginationInfo}</div>

      {/* Mobile: stacked cards instead of a cramped multi-column table. */}
      <ScrollableList className="divide-y divide-card-border rounded-lg border border-card-border bg-card-bg shadow-sm sm:hidden">
        {contacts.map((contact, i) => {
          const languageTags = contact.tags.filter((ct) => isLanguageTag(ct.tag.name));
          return (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="block px-4 py-3"
              style={{ backgroundColor: i % 2 === 0 ? LIGHT_ROW_BG : ALT_ROW_BG }}
            >
              {/* Name on its own single line, flag (no country name) at the
                  top right. Below that: the stage pill under the name (left)
                  and the language pill under the flag (right), on the same
                  line. Then the first email, then the first phone number
                  with the source right-aligned beside it. Only one of each
                  multi-value field (email/phone/language) is shown here;
                  the full set is still on the Contact Info page. */}
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-ink">
                  <ContactIcon avatarUrl={contact.avatarUrl} />
                  <span className="truncate">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</span>
                </p>
                {contact.country && <CountryFlag country={contact.country} />}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}>
                  {STAGE_LABELS[contact.stage]}
                </span>
                {languageTags[0] && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${TAG_KIND_COLORS[tagKind(languageTags[0].tag.name)]}`}>
                    {languageTags[0].tag.name}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-sm text-ink/70">{contact.email}</p>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm text-ink/70">
                  <PhoneDisplay value={contact.phone} country={contact.country} showFlag={false} />
                </p>
                <span className="shrink-0 text-xs text-ink/70">{contact.source ?? "—"}</span>
              </div>
            </Link>
          );
        })}
        {contacts.length === 0 && <p className="px-4 py-8 text-center text-sm text-soft">{t.contacts.noContactsFound}</p>}
      </ScrollableList>

      {/* Desktop/tablet: full table. Its own scrollbar (not the page's)
          reaches to the bottom of the screen, so the sticky header row
          stays visible while scrolling through contacts. table-fixed with
          an explicit colgroup keeps the table's own width pinned to its
          container no matter how long any cell's content is (truncated
          instead) — the earlier auto-layout table could grow wider than
          its container and force the whole page to scroll horizontally. */}
      <ScrollableList className="hidden rounded-lg border border-card-border bg-card-bg shadow-sm sm:block">
        <table className="w-full table-fixed divide-y divide-card-border text-sm">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
            <col className="w-[9%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead
            className="sticky top-0 z-20 text-left text-xs font-medium uppercase tracking-wide"
            style={{ backgroundColor: "#1e4430", color: "#f4faf6" }}
          >
            <tr>
              <SortableHeader field="name" label={t.contacts.colName} sortField={sortField} sortDir={sortDir} baseParams={baseParams} />
              <th className="px-4 py-3">{t.contacts.colEmail}</th>
              <th className="px-4 py-3">{t.contacts.colPhone}</th>
              <SortableHeader field="country" label={t.contacts.colCountry} sortField={sortField} sortDir={sortDir} baseParams={baseParams} />
              <SortableHeader field="stage" label={t.contacts.colStage} sortField={sortField} sortDir={sortDir} baseParams={baseParams} />
              <th className="px-4 py-3">{t.contacts.colLanguages}</th>
              <th className="px-4 py-3">{t.contacts.colTags}</th>
              <SortableHeader field="source" label={t.contacts.colSource} sortField={sortField} sortDir={sortDir} baseParams={baseParams} />
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {contacts.map((contact, i) => {
              const languageTags = contact.tags.filter((ct) => isLanguageTag(ct.tag.name));
              const otherTags = contact.tags.filter((ct) => !isLanguageTag(ct.tag.name));
              return (
                <tr key={contact.id} className="group relative" style={{ backgroundColor: i % 2 === 0 ? LIGHT_ROW_BG : ALT_ROW_BG }}>
                  <td className="truncate px-4 py-3">
                    {/* The whole row is clickable via this link stretching over
                        it (position:relative on the <tr> above makes it the
                        containing block for this absolutely-positioned span,
                        regardless of the td/a in between) — a pure-CSS
                        "stretched link" so no client component is needed just
                        for row navigation. */}
                    <Link
                      href={`/contacts/${contact.id}`}
                      className="relative z-10 flex items-center gap-2 font-medium text-ink group-hover:underline"
                    >
                      <span className="absolute inset-0 z-0 group-hover:bg-black/5" aria-hidden="true" />
                      {contact.avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={contact.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                      )}
                      <span className="truncate">{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    <div className="truncate">{contact.email}</div>
                    {contact.email2 && <div className="truncate">{contact.email2}</div>}
                    {contact.extraEmails.map((email) => (
                      <div key={email} className="truncate">
                        {email}
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    <div className="truncate">
                      <PhoneDisplay value={contact.phone} country={contact.country} />
                    </div>
                    {contact.phone2 && (
                      <div className="truncate">
                        <PhoneDisplay value={contact.phone2} country={contact.country} />
                      </div>
                    )}
                    {contact.extraPhones.map((phone) => (
                      <div key={phone} className="truncate">
                        <PhoneDisplay value={phone} country={contact.country} />
                      </div>
                    ))}
                  </td>
                  <td className="truncate px-4 py-3 text-ink/70">
                    {contact.country ? (
                      <span className="inline-flex max-w-full items-center gap-1.5">
                        <CountryFlag country={contact.country} /> <span className="truncate">{countryFullName(contact.country)}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="truncate px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}
                    >
                      {STAGE_LABELS[contact.stage]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <TagPills tags={languageTags} vertical />
                  </td>
                  <td className="px-4 py-3">
                    <TagPills tags={otherTags} />
                  </td>
                  <td className="truncate px-4 py-3 text-ink/70">{contact.source ?? "—"}</td>
                </tr>
              );
            })}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-soft">
                  {t.contacts.noContactsFound}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollableList>

    </div>
  );
}
