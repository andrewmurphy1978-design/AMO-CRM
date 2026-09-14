import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDistanceToNow, format } from "date-fns";
import TagManager from "./tag-manager";
import NoteForm from "./note-form";
import DeleteContactButton from "./delete-button";

const STAGE_LABELS: Record<string, string> = {
  LEAD: "Lead",
  PROSPECT: "Prospect",
  CLIENT: "Client",
  PAST_CLIENT: "Past client",
  UNSUBSCRIBED: "Unsubscribed",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      fieldValues: { include: { definition: true } },
      projects: { orderBy: { createdAt: "desc" } },
      activity: { orderBy: { createdAt: "desc" }, take: 20, include: { user: true } },
      owner: true,
    },
  });

  if (!contact) notFound();

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email;

  const coreFields: { label: string; value: string | null }[] = [
    { label: "Email", value: contact.email },
    { label: "Phone", value: contact.phone },
    { label: "Company", value: contact.company },
    { label: "Address", value: contact.address },
    { label: "City", value: contact.city },
    { label: "State", value: contact.state },
    { label: "Zip", value: contact.zip },
    { label: "Country", value: contact.country },
    { label: "Website", value: contact.website },
    { label: "Locale", value: contact.locale },
    { label: "Owner", value: contact.owner?.name ?? null },
    { label: "Source", value: contact.source },
    {
      label: "systeme.io registered",
      value: contact.systemeIoRegisteredAt
        ? format(contact.systemeIoRegisteredAt, "PP")
        : null,
    },
    {
      label: "Last synced",
      value: contact.lastSyncedAt ? formatDistanceToNow(contact.lastSyncedAt, { addSuffix: true }) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{fullName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {STAGE_LABELS[contact.stage]}
            {contact.systemeIoId && ` · systeme.io #${contact.systemeIoId}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/contacts/${contact.id}/edit`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Edit
          </Link>
          <Link
            href={`/projects/new?contactId=${contact.id}`}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            New project
          </Link>
          <DeleteContactButton contactId={contact.id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Contact details</h2>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {coreFields
                .filter((f) => f.value)
                .map((f) => (
                  <div key={f.label}>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">{f.label}</dt>
                    <dd className="text-slate-700">{f.value}</dd>
                  </div>
                ))}
            </dl>

            {contact.fieldValues.length > 0 && (
              <>
                <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Other systeme.io fields
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {contact.fieldValues.map((fv) => (
                    <div key={fv.id}>
                      <dt className="text-xs uppercase tracking-wide text-slate-400">
                        {fv.definition?.label ?? fv.fieldSlug}
                      </dt>
                      <dd className="text-slate-700">{fv.value}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}

            {contact.notes && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{contact.notes}</p>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Projects</h2>
            </div>
            {contact.projects.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No projects yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {contact.projects.map((project) => (
                  <li key={project.id} className="py-2">
                    <Link href={`/projects/${project.id}`} className="font-medium text-slate-900 hover:underline">
                      {project.name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{project.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Activity</h2>
            <NoteForm contactId={contact.id} />
            <ul className="mt-4 space-y-3">
              {contact.activity.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <p className="text-slate-700">{entry.message}</p>
                  <p className="text-xs text-slate-400">
                    {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
            <TagManager
              contactId={contact.id}
              tags={contact.tags.map((ct) => ({ id: ct.tagId, name: ct.tag.name }))}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
