"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/section-card";
import { useFileDrop, DROP_RING } from "@/components/use-file-drop";
import { deleteAttachedFile, renameAttachedFile } from "@/actions/attached-files";

export interface FileRow {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  note: string | null;
  createdAt: string; // ISO
  uploadedByName: string | null;
  from?: { label: string; href: string }; // a file that lives on one of the contact's projects
  kind?: string; // Proposal, Signed proposal, Invoice, Payment confirmation...
  href?: string; // a document the CRM generates or already holds (no upload): opens this link
}

const MAX_MB = 10;

function sizeLabel(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function icon(mime: string, name: string): string {
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("image/")) return "🖼️";
  if (/zip|compressed|tar|rar/.test(mime) || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return "🗜️";
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv)$/i.test(name)) return "📊";
  if (/word|document|text|rtf/.test(mime) || /\.(docx?|txt|md|rtf)$/i.test(name)) return "📝";
  if (mime.startsWith("video/")) return "🎞️";
  if (mime.startsWith("audio/")) return "🎵";
  return "📎";
}

// The File card of a Contact or a Project: drag files onto it (or click Add files), open, rename or
// delete them. The bytes are never part of the page: they load from /api/files/<id>.
export default function FilesCard({
  scope,
  files,
  lang,
}: {
  scope: { contactId: string } | { projectId: string };
  files: FileRow[];
  lang: "en" | "fr";
}) {
  const fr = lang === "fr";
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", note: "" });

  async function upload(list: FileList | File[]) {
    const all = [...list];
    if (all.length === 0) return;
    setBusy(true);
    setMessage(null);
    const problems: string[] = [];
    for (const f of all) {
      if (f.size > MAX_MB * 1_000_000) {
        problems.push(`${f.name}: ${fr ? `plus de ${MAX_MB} Mo` : `over ${MAX_MB} MB`}`);
        continue;
      }
      const form = new FormData();
      form.set("file", f);
      if ("contactId" in scope) form.set("contactId", scope.contactId);
      else form.set("projectId", scope.projectId);
      try {
        const res = await fetch("/api/files", { method: "POST", body: form });
        if (!res.ok) problems.push(`${f.name}: ${fr ? "échec du téléversement" : "upload failed"}`);
        else {
          const json = (await res.json()) as { problems?: string[] };
          problems.push(...(json.problems ?? []));
        }
      } catch {
        problems.push(`${f.name}: ${fr ? "échec du téléversement" : "upload failed"}`);
      }
    }
    setBusy(false);
    if (problems.length > 0) setMessage(problems.join(" · "));
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const drop = useFileDrop((list) => void upload(list), busy);
  const dateOf = (iso: string) => new Date(iso).toLocaleDateString(fr ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" });

  return (
    <Card
      color="files"
      title={
        <>
          {fr ? "Fichiers" : "Files"}
          {files.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{files.length}</span>}
        </>
      }
      compact
      actions={
        <button type="button" onClick={() => input.current?.click()} disabled={busy} className="rounded border border-white/40 px-2 py-0.5 text-xs font-medium normal-case text-white hover:bg-white/15 disabled:opacity-60">
          {busy ? "…" : fr ? "+ Ajouter" : "+ Add files"}
        </button>
      }
    >
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => e.target.files && void upload(e.target.files)} />
      <div {...drop.bind} className={`rounded-lg border-2 border-dashed border-card-border p-3 text-center text-xs text-soft ${drop.dragging ? DROP_RING : ""}`}>
        {busy ? (fr ? "Téléversement…" : "Uploading…") : fr ? `Glissez-déposez des fichiers ici (${MAX_MB} Mo max chacun) ou cliquez sur « Ajouter ».` : `Drag and drop files here (${MAX_MB} MB max each) or click “Add files”.`}
      </div>
      {message && <p className="text-xs text-red-600">{message}</p>}

      {files.length === 0 ? (
        <p className="text-sm text-soft">{fr ? "Aucun fichier pour le moment." : "No files yet."}</p>
      ) : (
        <ul className="divide-y divide-card-border">
          {files.map((f) => {
            const open = f.href ?? `/api/files/${f.id}`;
            const own = !f.href && !f.from; // an uploaded file of this card: can be edited or deleted
            return (
            <li key={f.id} className="flex items-start gap-3 py-2">
              {!f.href && f.mimeType.startsWith("image/") && !/svg/i.test(f.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element -- served by /api/files
                <img src={`/api/files/${f.id}`} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded border border-card-border bg-black/5 object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-card-border bg-black/5 text-xl">{icon(f.mimeType, f.name)}</span>
              )}
              <div className="min-w-0 flex-1">
                {editing === f.id ? (
                  <div className="space-y-1">
                    <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-md border border-card-border bg-field-bg px-2 py-1 text-sm text-ink" />
                    <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder={fr ? "Note (facultatif)" : "Note (optional)"} className="w-full rounded-md border border-card-border bg-field-bg px-2 py-1 text-xs text-ink" />
                    <div className="flex gap-3 text-xs">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await renameAttachedFile(f.id, draft.name, draft.note);
                            setEditing(null);
                            router.refresh();
                          })
                        }
                        className="font-semibold text-emerald-700 hover:underline"
                      >
                        {fr ? "Enregistrer" : "Save"}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="text-soft hover:underline">
                        {fr ? "Annuler" : "Cancel"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <a href={open} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-emerald-700 hover:underline" title={f.name}>
                      {f.name}
                    </a>
                    <p className="text-xs text-soft">
                      {f.kind && <span className="mr-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] font-medium text-ink">{f.kind}</span>}
                      {f.size > 0 && `${sizeLabel(f.size)} · `}
                      {dateOf(f.createdAt)}
                      {f.uploadedByName ? ` · ${f.uploadedByName}` : ""}
                      {f.from && (
                        <>
                          {" · "}
                          <a href={f.from.href} className="text-ink hover:underline">
                            {f.from.label}
                          </a>
                        </>
                      )}
                    </p>
                    {f.note && <p className="text-xs text-ink">{f.note}</p>}
                  </>
                )}
              </div>
              {editing !== f.id && (
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <a href={f.href ?? `/api/files/${f.id}?download=1`} {...(f.href ? { target: "_blank", rel: "noreferrer" } : {})} className="text-soft hover:underline">
                    {fr ? "Télécharger" : "Download"}
                  </a>
                  {own && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(f.id);
                          setDraft({ name: f.name, note: f.note ?? "" });
                        }}
                        className="text-soft hover:underline"
                      >
                        {fr ? "Modifier" : "Edit"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(fr ? `Supprimer « ${f.name} » ?` : `Delete “${f.name}”?`)) return;
                          startTransition(async () => {
                            await deleteAttachedFile(f.id);
                            router.refresh();
                          });
                        }}
                        className="text-red-600 hover:underline"
                      >
                        {fr ? "Supprimer" : "Delete"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
