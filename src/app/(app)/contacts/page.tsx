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

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-emerald-50 text-emerald-700",
  PROSPECT: "bg-teal-50 text-teal-700",
  CLIENT: "bg-sky-50 text-sky-700",
  PAST_CLIENT: "bg-red-200 text-red-900",
  UNSUBSCRIBED: "bg-red-50 text-red-600",
  PERSONAL: "bg-violet-50 text-violet-700",
};

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

type SortField = "name" | "country" | "stage" | "source";
const SORT_FIELDS: SortField[] = ["name", "country", "stage", "source"];

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
  searchParams: Promise<{ q?: string; stage?: string | string[]; tag?: string | string[]; sort?: string; dir?: string }>;
}) {
  const { q, stage, tag, sort, dir } = await searchParams;
  const stages = toArray(stage);
  const selectedTags = toArray(tag);
  const sortField: SortField | null = SORT_FIELDS.includes(sort as SortField) ? (sort as SortField) : null;
  const sortDir: "asc" | "desc" = dir === "desc" ? "desc" : "asc";
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

  // One shared client for all three reads below — see src/lib/prisma.ts
  // for why (each `prisma.x` property access on the raw proxy opens a
  // brand-new connection; three of those on this frequently-visited page
  // was a real contributor to Cloudflare's Error 1102).
  const { contacts, tags, hour12 } = await withScopedPrismaClient(async (db) => {
    const contacts = await db.contact.findMany({
      where,
      orderBy,
      take: 100,
      include: { tags: { include: { tag: true } } },
    });
    const tags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const hour12 = await getHour12(session, db);
    return { contacts, tags, hour12 };
  });

  const stageOptions = Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }));
  const tagOptions = tags.map((tg) => ({ value: tg.name, label: tg.name }));

  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  for (const s of stages) baseParams.append("stage", s);
  for (const tg of selectedTags) baseParams.append("tag", tg);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.contacts.title}
        hour12={hour12}
        dateLocale={dateLocale}
        location={t.dashboard.myLocation}
        actions={
          <Link href="/contacts/new" className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm">
            {t.contacts.newContact}
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
        filterLabel={t.common.filter}
        trailing={
          <span className="ml-auto rounded-full bg-amo-lime/15 px-3 py-1.5 text-sm font-semibold text-emerald-800">
            {t.contacts.shown(contacts.length)}
          </span>
        }
      />

      {/* Mobile: stacked cards instead of a cramped multi-column table. */}
      <ScrollableList className="divide-y divide-card-border rounded-lg border border-card-border bg-card-bg shadow-sm sm:hidden">
        {contacts.map((contact, i) => {
          const languageTags = contact.tags.filter((ct) => isLanguageTag(ct.tag.name));
          const otherTags = contact.tags.filter((ct) => !isLanguageTag(ct.tag.name));
          return (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className="block px-4 py-3"
              style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-ink">
                  {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
                </p>
                <span className="shrink-0 text-xs text-ink/70">{contact.source ?? "—"}</span>
              </div>
              <p className="mt-1 truncate text-sm text-ink/70">{contact.email}</p>
              <p className="mt-0.5 text-sm text-ink/70">
                <PhoneDisplay value={contact.phone} country={contact.country} />
                {contact.country && (
                  <>
                    {" · "}
                    <CountryFlag country={contact.country} /> {countryFullName(contact.country)}
                  </>
                )}
              </p>
              <div className="mt-2">
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}>
                  {STAGE_LABELS[contact.stage]}
                </span>
              </div>
              {languageTags.length > 0 && (
                <div className="mt-1.5">
                  <TagPills tags={languageTags} />
                </div>
              )}
              {otherTags.length > 0 && (
                <div className="mt-1.5">
                  <TagPills tags={otherTags} />
                </div>
              )}
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
            className="sticky top-0 z-10 text-left text-xs font-medium uppercase tracking-wide"
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
                <tr key={contact.id} className="group relative" style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}>
                  <td className="truncate px-4 py-3">
                    {/* The whole row is clickable via this link stretching over
                        it (position:relative on the <tr> above makes it the
                        containing block for this absolutely-positioned span,
                        regardless of the td/a in between) — a pure-CSS
                        "stretched link" so no client component is needed just
                        for row navigation. */}
                    <Link href={`/contacts/${contact.id}`} className="relative z-10 font-medium text-ink group-hover:underline">
                      <span className="absolute inset-0 z-0 group-hover:bg-black/5" aria-hidden="true" />
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
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
