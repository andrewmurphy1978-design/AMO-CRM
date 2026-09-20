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

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-emerald-50 text-emerald-700",
  PROSPECT: "bg-teal-50 text-teal-700",
  CLIENT: "bg-sky-50 text-sky-700",
  PAST_CLIENT: "bg-red-200 text-red-900",
  UNSUBSCRIBED: "bg-red-50 text-red-600",
};

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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
  searchParams: Promise<{ q?: string; stage?: string | string[]; tag?: string | string[] }>;
}) {
  const { q, stage, tag } = await searchParams;
  const stages = toArray(stage);
  const selectedTags = toArray(tag);
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

  // One shared client for all three reads below — see src/lib/prisma.ts
  // for why (each `prisma.x` property access on the raw proxy opens a
  // brand-new connection; three of those on this frequently-visited page
  // was a real contributor to Cloudflare's Error 1102).
  const { contacts, tags, hour12 } = await withScopedPrismaClient(async (db) => {
    const contacts = await db.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { tags: { include: { tag: true } } },
    });
    const tags = await db.tag.findMany({ orderBy: { name: "asc" } });
    const hour12 = await getHour12(session, db);
    return { contacts, tags, hour12 };
  });

  const stageOptions = Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }));
  const tagOptions = tags.map((tg) => ({ value: tg.name, label: tg.name }));

  return (
    <div className="space-y-6">
      <PageHeader title={t.contacts.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <div className="flex items-center justify-between">
        <p className="text-sm text-soft">{t.contacts.shown(contacts.length)}</p>
        <Link
          href="/contacts/new"
          className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm"
        >
          {t.contacts.newContact}
        </Link>
      </div>

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
      />

      {/* Mobile: stacked cards instead of a cramped multi-column table. */}
      <div className="divide-y divide-card-border rounded-lg border border-card-border bg-card-bg shadow-sm sm:hidden">
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
      </div>

      {/* Desktop/tablet: full table. */}
      <div className="hidden overflow-x-auto rounded-lg border border-card-border bg-card-bg shadow-sm sm:block">
        <table className="min-w-full divide-y divide-card-border text-sm">
          <thead className="text-left text-xs font-medium uppercase tracking-wide" style={{ backgroundColor: "#1e4430", color: "#f4faf6" }}>
            <tr>
              <th className="px-4 py-3">{t.contacts.colName}</th>
              <th className="px-4 py-3">{t.contacts.colEmail}</th>
              <th className="px-4 py-3">{t.contacts.colPhone}</th>
              <th className="px-4 py-3">{t.contacts.colCountry}</th>
              <th className="px-4 py-3">{t.contacts.colStage}</th>
              <th className="px-4 py-3">{t.contacts.colLanguages}</th>
              <th className="px-4 py-3">{t.contacts.colTags}</th>
              <th className="px-4 py-3">{t.contacts.colSource}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {contacts.map((contact, i) => {
              const languageTags = contact.tags.filter((ct) => isLanguageTag(ct.tag.name));
              const otherTags = contact.tags.filter((ct) => !isLanguageTag(ct.tag.name));
              return (
                <tr key={contact.id} className="group relative" style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}>
                  <td className="px-4 py-3">
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
                    <div>{contact.email}</div>
                    {contact.email2 && <div className="text-xs text-soft">{contact.email2}</div>}
                    {contact.extraEmails.map((email) => (
                      <div key={email} className="text-xs text-soft">
                        {email}
                      </div>
                    ))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink/70">
                    <div>
                      <PhoneDisplay value={contact.phone} country={contact.country} />
                    </div>
                    {contact.phone2 && (
                      <div className="text-xs text-soft">
                        <PhoneDisplay value={contact.phone2} country={contact.country} />
                      </div>
                    )}
                    {contact.extraPhones.map((phone) => (
                      <div key={phone} className="text-xs text-soft">
                        <PhoneDisplay value={phone} country={contact.country} />
                      </div>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {contact.country ? (
                      <span className="inline-flex items-center gap-1.5">
                        <CountryFlag country={contact.country} /> {countryFullName(contact.country)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}
                    >
                      {STAGE_LABELS[contact.stage]}
                    </span>
                  </td>
                  <td className="w-px px-4 py-3">
                    <TagPills tags={languageTags} vertical />
                  </td>
                  <td className="px-4 py-3">
                    <TagPills tags={otherTags} />
                  </td>
                  <td className="px-4 py-3 text-ink/70">{contact.source ?? "—"}</td>
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
      </div>
    </div>
  );
}
