"use client";

import { useActionState, useState, useTransition } from "react";
import { addPersonalWatchEmail, updatePersonalWatchEmail, deletePersonalWatchEmail } from "@/actions/personal-watch";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import type { WatchedPerson } from "@/lib/personal-watch";

function EmailRow({ id, email }: { id: string; email: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(email);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save() {
    startTransition(async () => {
      const result = await updatePersonalWatchEmail(id, value);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setEditing(false);
      }
    });
  }

  function remove() {
    startTransition(() => deletePersonalWatchEmail(id));
  }

  if (editing) {
    return (
      <li className="flex items-center gap-2">
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <button type="button" onClick={save} disabled={pending} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-60">
          {pending ? "..." : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-soft hover:underline">
          Cancel
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{email}</span>
      <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-soft hover:underline">
        Edit
      </button>
      <button type="button" onClick={remove} disabled={pending} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60">
        Delete
      </button>
    </li>
  );
}

function PersonEmailManager({ person, t }: { person: WatchedPerson; t: ReturnType<typeof getDict> }) {
  const [saveState, saveAction, savePending] = useActionState(addPersonalWatchEmail, undefined);

  return (
    <div>
      <h3 className="text-sm font-semibold text-ink">{person.name}</h3>
      <ul className="mt-1 space-y-1">
        {person.emails.map((e) => (
          <EmailRow key={e.id} id={e.id} email={e.email} />
        ))}
        {person.emails.length === 0 && <li className="text-sm text-soft">—</li>}
      </ul>
      <form action={saveAction} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="personId" value={person.id} />
        <input
          type="email"
          name="email"
          placeholder={t.personal.addEmailPlaceholder}
          className="min-w-0 flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <button
          type="submit"
          disabled={savePending}
          className="shrink-0 rounded-md border border-card-border px-3 py-1 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {t.personal.addEmail}
        </button>
      </form>
      {saveState?.error && <p className="mt-1 text-xs text-red-600">{saveState.error}</p>}
    </div>
  );
}

export default function PersonalWatchForm({ people, lang }: { people: WatchedPerson[]; lang: Lang }) {
  const t = getDict(lang);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {people.map((p) => (
        <PersonEmailManager key={p.id} person={p} t={t} />
      ))}
    </div>
  );
}
