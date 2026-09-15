import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const STAGE_LABELS: Record<string, string> = {
  LEAD: "Lead",
  PROSPECT: "Prospect",
  CLIENT: "Client",
  PAST_CLIENT: "Past client",
  UNSUBSCRIBED: "Unsubscribed",
};

const STAGE_COLORS: Record<string, string> = {
  LEAD: "bg-white/10 text-amo-muted",
  PROSPECT: "bg-amo-blue/15 text-amo-blue",
  CLIENT: "bg-amo-lime/15 text-amo-lime",
  PAST_CLIENT: "bg-amo-gold/15 text-amo-gold",
  UNSUBSCRIBED: "bg-red-500/15 text-red-400",
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stage?: string; tag?: string }>;
}) {
  const { q, stage, tag } = await searchParams;

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
          <h1 className="font-display text-2xl font-semibold text-amo-white">Contacts</h1>
          <p className="mt-1 text-sm text-amo-muted">{contacts.length} shown</p>
        </div>
        <Link
          href="/contacts/new"
          className="rounded-lg bg-gradient-to-r from-amo-lime to-amo-teal px-4 py-2 text-sm font-semibold text-amo-green shadow-[0_4px_14px_rgba(46,204,113,0.25)] transition-transform hover:scale-[1.02]"
        >
          New contact
        </Link>
      </div>

      <form className="flex flex-wrap gap-3" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search name, email, company..."
          className="w-64 rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        />
        <select
          name="stage"
          defaultValue={stage ?? ""}
          className="rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        >
          <option value="">All stages</option>
          {Object.entries(STAGE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="tag"
          defaultValue={tag ?? ""}
          className="rounded-md border border-amo-border bg-white/5 px-3 py-2 text-sm text-amo-white shadow-sm focus:border-amo-lime focus:outline-none focus:ring-2 focus:ring-amo-lime/30"
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md border border-amo-border px-4 py-2 text-sm font-medium text-amo-white hover:bg-white/10"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-amo-border bg-amo-card shadow-sm">
        <table className="min-w-full divide-y divide-white/10 text-sm">
          <thead className="bg-white/5 text-left text-xs font-medium uppercase tracking-wide text-amo-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-white/5">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${contact.id}`} className="font-medium text-amo-white hover:underline">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-amo-muted">{contact.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${STAGE_COLORS[contact.stage]}`}
                  >
                    {STAGE_LABELS[contact.stage]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {contact.tags.map((ct) => (
                      <span
                        key={ct.tagId}
                        className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-amo-muted"
                      >
                        {ct.tag.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-amo-muted">{contact.source ?? "—"}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-amo-muted">
                  No contacts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
