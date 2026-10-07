"use client";

import { useState } from "react";

// For the mock-up zip: the full task is inside it (TASK.md), so one short line in the chat is enough.
const SHORT =
  "The attached zip contains TASK.md (the full task) and all the project files. Read TASK.md first and carry it out exactly as written. Do not ask me any questions or what to do with the files: start working now and give me the files to download at the end.";

// The brand files as a .zip, to drag and drop into an AI chat next to the prompt (Chrome / Edge let
// you drag this chip straight into the chat; everywhere else it is a normal download link).
export default function BrandZipLink({
  url,
  count,
  fr,
}: {
  url: string;
  count: number;
  fr: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const isMockup = url.endsWith("mockup-inputs");
  return (
    <>
      <a
        href={url}
        download
        draggable
        onDragStart={(e) => {
          const abs = new URL(url, window.location.origin).toString();
          const zipName = `${url.split("/").pop()}.zip`;
          e.dataTransfer.setData(
            "DownloadURL",
            `application/zip:${zipName}:${abs}`,
          );
          e.dataTransfer.effectAllowed = "copy";
        }}
        className="mt-2 inline-flex items-center gap-2 rounded-md border border-dashed border-card-border bg-field-bg px-3 py-1.5 text-xs font-semibold text-ink hover:bg-black/5"
        title={
          fr
            ? "Glissez-déposez ce fichier dans l'IA avec le prompt"
            : "Drag and drop this file into the AI together with the prompt"
        }
      >
        📦 {url.split("/").pop()}.zip ({count}{" "}
        {fr
          ? count > 1
            ? "fichiers"
            : "fichier"
          : count > 1
            ? "files"
            : "file"}
        )
        <span className="font-normal text-soft">
          {fr
            ? "— à joindre au MÊME message que le prompt (collez le prompt, joignez le zip, puis envoyez)"
            : "— attach it to the SAME message as the prompt (paste the prompt, attach the zip, then send)"}
        </span>
      </a>
      {isMockup && (
        <div className="mt-2 rounded-md border border-card-border bg-field-bg p-2 text-xs">
          <p className="text-soft">
            {fr
              ? "Le prompt complet est dans le zip (TASK.md). Dans l'IA : joignez le zip et collez seulement ce court message :"
              : "The full prompt is inside the zip (TASK.md). In the AI: attach the zip and paste only this short message:"}
          </p>
          <p className="mt-1 text-ink">{SHORT}</p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(SHORT);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard unavailable */
              }
            }}
            className="mt-1 font-semibold text-emerald-700 hover:underline"
          >
            {copied
              ? fr
                ? "Copié"
                : "Copied"
              : fr
                ? "Copier le court message"
                : "Copy the short message"}
          </button>
        </div>
      )}
    </>
  );
}
