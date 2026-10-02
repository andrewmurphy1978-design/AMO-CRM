"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProjectType } from "@/actions/project-types";

const INPUT =
  "w-full rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

// "+ New project type" at the bottom of the type sidebar.
export default function NewTypeButton({ lang }: { lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameFr, setNameFr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-card-border px-3 py-1.5 text-left text-sm font-medium text-ink hover:border-amo-gold md:rounded-lg"
      >
        + {fr ? "Nouveau type de projet" : "New project type"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-card-border bg-field-bg p-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={fr ? "Nom (anglais)" : "Name (English)"} className={INPUT} />
      <input value={nameFr} onChange={(e) => setNameFr(e.target.value)} placeholder={fr ? "Nom en français (facultatif)" : "French name (optional)"} className={INPUT} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await createProjectType(name, nameFr);
              if (res.error) return setError(res.error);
              setOpen(false);
              setName("");
              setNameFr("");
              setError(null);
              router.push(`/project-types?type=${res.key}`);
              router.refresh();
            })
          }
          className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? "…" : fr ? "Créer" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-soft hover:underline">
          {fr ? "Annuler" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
