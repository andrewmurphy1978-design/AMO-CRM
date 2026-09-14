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
  LEAD: "bg-slate-100 text-slate-700",
  PROSPECT: "bg-blue-100 text-blue-700",
  CLIENT: "bg-emerald-100 text-emerald-700",
  PAST_CLIENT: "bg-amber-100 text-amber-700",
  UNSUBSCRIBED: "bg-red-100 text-red-700",
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

  const [contacts, tags] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { tags: { include: { tag: true } } },
    }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contacts</h1>
          <p className="mt-1 text-sm text-slate-500">{contacts.length} shown</p>
        </div>
        <Link
          href="/contacts/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
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
          className="w-64 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
        <select
          name="stage"
          defaultValue={stage ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
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
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
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
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Filter
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Tags</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {contacts.map((contact) => (
              <tr key={contact.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${contact.id}`} className="font-medium text-slate-900 hover:underline">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{contact.email}</td>
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
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {ct.tag.name}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">{contact.source ?? "—"}</td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
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
