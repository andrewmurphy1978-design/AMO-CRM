import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
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

function TagPills({ tags }: { tags: { tagId: string; tag: { name: string } }[] }) {
  return (
    <div className="flex flex-wrap gap-1">
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
  const lang = await getLang();
  const t = getDict(lang);
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

  // Sequential, not Promise.all — see src/lib/prisma.ts for why.
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { tags: { include: { tag: true } } },
  });
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });

  const stageOptions = Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label }));
  const tagOptions = tags.map((tg) => ({ value: tg.name, label: tg.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink">{t.contacts.title}</h1>
          <p className="mt-1 text-sm text-soft">{t.contacts.shown(contacts.length)}</p>
        </div>
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
                <tr key={contact.id} style={{ backgroundColor: i % 2 === 0 ? "#f4faf6" : "#7fa898" }}>
                  <td className="px-4 py-3">
                    <Link href={`/contacts/${contact.id}`} className="font-medium text-ink hover:underline">
                      {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{contact.email}</td>
                  <td className="px-4 py-3 text-ink/70">
                    <PhoneDisplay value={contact.phone} country={contact.country} />
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
                  <td className="px-4 py-3">
                    <TagPills tags={languageTags} />
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
