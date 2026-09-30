"use client";

import type { Lang } from "@/lib/i18n/dictionaries";

// Formatted in the viewer's own browser timezone: the server renders in
// UTC, so its text differs from the browser's — suppressHydrationWarning
// lets React keep the browser's version instead of flagging the mismatch.
export default function NoteTimestamps({
  createdAt,
  updatedAt,
  lang,
}: {
  createdAt: string;
  updatedAt: string;
  lang: Lang;
}) {
  const fmt = new Intl.DateTimeFormat(lang === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" });
  return (
    <p className="mt-1 text-xs text-soft">
      <span className="uppercase tracking-wide">{lang === "fr" ? "Créée" : "Created"}:</span>{" "}
      <span suppressHydrationWarning>{fmt.format(new Date(createdAt))}</span>
      {" · "}
      <span className="uppercase tracking-wide">{lang === "fr" ? "Modifiée" : "Modified"}:</span>{" "}
      <span suppressHydrationWarning>{fmt.format(new Date(updatedAt))}</span>
    </p>
  );
}
