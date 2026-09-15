import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-emerald-50 text-emerald-700",
  PROSPECT: "bg-teal-50 text-teal-700",
  CLIENT: "bg-sky-50 text-sky-700",
  PAST_CLIENT: "bg-red-200 text-red-900",
  UNSUBSCRIBED: "bg-red-50 text-red-600",
};

type TagKind = "fr" | "en" | "other";

function tagKind(name: string): TagKind {
  const n = name.trim().toLowerCase();
  if (n === "français" || n === "francais" || n === "french") return "fr";
  if (n === "english" || n === "anglais") return "en";
  return "other";
}

const TAG_KIND_RANK: Record<TagKind, number> = { fr: 0, en: 1, other: 2 };

const TAG_KIND_COLORS: Record<TagKind, string> = {
  fr: "bg-sky-50 text-sky-700",
  en: "bg-red-50 text-red-600",
  other: "bg-black/5 text-soft",
};

function sortTags<T extends { tag: { name: string } }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => {
    const rankDiff = TAG_KIND_RANK[tagKind(a.tag.name)] - TAG_KIND_RANK[tagKind(b.tag.name)];
    if (rankDiff !== 0) return rankDiff;
    return a.tag.name.localeCompare(b.tag.name);
  });
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; tag?: string }>;
}) {
  const { q, stage, tag } = await searchParams;
  const lang = await getLang();
  const t = getDict(lang);
  const STAGE_LABELS = t.stages;

  const where: Prisma.ContactWhereInput = {};
  if (stage) where.stage = stage as Prisma.ContactWhereInput["stage"];
  if (tag) where.tags = { some: { tag: { name: tag } } };
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

      <form className="flex flex-wrap gap-3" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={t.contacts.searchPlaceholder}
          className="w-64 rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <select
          name="stage"
          defaultValue={stage ?? ""}
          className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        >
          <option value="">{t.contacts.allStages}</option>
          {Object.entries(STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="tag"
          defaultValue={tag ?? ""}
          className="rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        >
          <option value="">{t.contacts.allTags}</option>
          {tags.map((tagOption) => (
            <option key={tagOption.id} value={tagOption.name}>
              {tagOption.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-card-border px-4 py-2 text-sm font-medium text-ink hover:bg-black/5"
        >
          {t.common.filter}
        </button>
      </form>

      {/* Mobile: stacked cards instead of a cramped multi-column table. */}
      <div className="divide-y divide-card-border rounded-lg border border-card-border bg-card-bg shadow-sm sm:hidden">
        {contacts.map((contact, i) => (
          <Link
            key={contact.id}
            href={`/contacts/${contact.id}`}
            className={`block px-4 py-3 ${i % 2 === 0 ? "bg-black/15" : "bg-white/[0.03]"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-ink">
                {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
              </p>
              <span className="shrink-0 text-xs text-soft">{contact.source ?? "—"}</span>
            </div>
            <p className="mt-1 truncate text-sm text-soft">{contact.email}</p>
            <div className="mt-2">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}>
                {STAGE_LABELS[contact.stage]}
              </span>
            </div>
            {contact.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {sortTags(contact.tags).map((ct) => (
                  <span
                    key={ct.tagId}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${TAG_KIND_COLORS[tagKind(ct.tag.name)]}`}
                  >
                    {ct.tag.name}
                  </span>
                ))}
              </div>
            )}
          </Link>
        ))}
        {contacts.length === 0 && <p className="px-4 py-8 text-center text-sm text-soft">{t.contacts.noContactsFound}</p>}
      </div>

      {/* Desktop/tablet: full table. */}
      <div className="hidden overflow-x-auto rounded-lg border border-card-border bg-card-bg shadow-sm sm:block">
        <table className="min-w-full divide-y divide-card-border text-sm">
          <thead className="bg-field-bg text-left text-xs font-medium uppercase tracking-wide text-soft">
            <tr>
              <th className="px-4 py-3">{t.contacts.colName}</th>
              <th className="px-4 py-3">{t.contacts.colEmail}</th>
              <th className="px-4 py-3">{t.contacts.colStage}</th>
              <th className="px-4 py-3">{t.contacts.colTags}</th>
              <th className="px-4 py-3">{t.contacts.colSource}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-card-border">
            {contacts.map((contact) => (
              <tr key={contact.id} className="odd:bg-black/15 even:bg-white/[0.03] hover:bg-black/5">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${contact.id}`} className="font-medium text-ink hover:underline">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-soft">{contact.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}
                  >
                    {STAGE_LABELS[contact.stage]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {sortTags(contact.tags).map((ct) => (
                      <span
                        key={ct.tagId}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${TAG_KIND_COLORS[tagKind(ct.tag.name)]}`}
                      >
                        {ct.tag.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-soft">{contact.source ?? "—"}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-soft">
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
