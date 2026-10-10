"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAttachedFile } from "@/actions/attached-files";
import type { FileRow } from "@/components/files-card";

// The final reports (PDFs) of the Brand, Research and Mock-up cards, listed the same way everywhere:
// name (opens it), date, Download, Delete.
export default function FinalReports({ title, files, fr }: { title: string; files: FileRow[]; fr: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (files.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</p>
      <ul className="mt-2 space-y-1">
        {files.map((r) => (
          <li key={r.id} className="flex items-center gap-3 text-sm">
            <span>📄</span>
            <a href={`/api/files/${r.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-emerald-700 hover:underline" title={r.name}>
              {r.name}
            </a>
            <span className="shrink-0 text-xs text-soft">{new Date(r.createdAt).toLocaleDateString(fr ? "fr-CA" : "en-CA")}</span>
            <a href={`/api/files/${r.id}?download=1`} className="shrink-0 text-xs text-soft hover:underline">
              {fr ? "Télécharger" : "Download"}
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(fr ? `Supprimer « ${r.name} » ?` : `Delete “${r.name}”?`)) return;
                startTransition(async () => {
                  await deleteAttachedFile(r.id);
                  router.refresh();
                });
              }}
              className="shrink-0 text-xs text-red-600 hover:underline"
            >
              {fr ? "Supprimer" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
