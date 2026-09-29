"use client";

import { useActionState, useState, useTransition } from "react";
import { createTag, updateTag, deleteTag, moveTag } from "@/actions/tags";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import { sortTagLikes, type TagLike } from "@/lib/tag-colors";
import type { TagCategory } from "@prisma/client";

export interface TagRow {
  id: string;
  name: string;
  category: TagCategory;
  color: string | null;
  order: number;
}

const DEFAULT_SWATCH = "#e5e7eb";

function TagRowEditor({ tag, t, siblingCount, position }: { tag: TagRow; t: ReturnType<typeof getDict>; siblingCount: number; position: number }) {
  const [name, setName] = useState(tag.name);
  const [category, setCategory] = useState<TagCategory>(tag.category);
  const [useCustomColor, setUseCustomColor] = useState(Boolean(tag.color));
  const [color, setColor] = useState(tag.color ?? DEFAULT_SWATCH);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const boundUpdate = updateTag.bind(null, tag.id);

  function save() {
    setError(null);
    setSaved(false);
    const formData = new FormData();
    formData.set("name", name);
    formData.set("category", category);
    formData.set("color", useCustomColor ? color : "");
    startTransition(async () => {
      const result = await boundUpdate(undefined, formData);
      if (result.error) setError(result.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-card-border p-2">
      <input
        type="color"
        value={useCustomColor ? color : DEFAULT_SWATCH}
        disabled={!useCustomColor}
        onChange={(e) => setColor(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded border border-card-border disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={t.tagManagerSettings.color}
      />
      <label className="flex shrink-0 items-center gap-1 text-xs text-soft">
        <input type="checkbox" checked={useCustomColor} onChange={(e) => setUseCustomColor(e.target.checked)} className="accent-amo-lime" />
        {t.tagManagerSettings.customColor}
      </label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="min-w-[8rem] flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as TagCategory)}
        className="shrink-0 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm"
      >
        <option value="LANGUAGE">{t.tagManagerSettings.categoryLanguage}</option>
        <option value="PERSONAL">{t.tagManagerSettings.categoryPersonal}</option>
        <option value="SYSTEME_IO">{t.tagManagerSettings.categorySystemeIo}</option>
      </select>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={pending || position === 0}
          onClick={() => startTransition(() => moveTag(tag.id, "up"))}
          aria-label={t.settings.worldClockMoveUp}
          className="rounded border border-card-border px-1.5 py-0.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={pending || position === siblingCount - 1}
          onClick={() => startTransition(() => moveTag(tag.id, "down"))}
          aria-label={t.settings.worldClockMoveDown}
          className="rounded border border-card-border px-1.5 py-0.5 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        disabled={pending || !name.trim()}
        onClick={save}
        className="shrink-0 rounded-md border border-card-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-black/5 disabled:opacity-60"
      >
        {saved ? t.common.save + " ✓" : t.common.save}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(t.tagManagerSettings.deleteConfirm)) return;
          startTransition(() => deleteTag(tag.id));
        }}
        className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
      >
        {t.common.delete}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </li>
  );
}

function CategoryGroup({ title, tags, t }: { title: string; tags: TagRow[]; t: ReturnType<typeof getDict> }) {
  if (tags.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">{title}</h4>
      <ul className="mt-2 space-y-2">
        {tags.map((tag, i) => (
          <TagRowEditor key={tag.id} tag={tag} t={t} siblingCount={tags.length} position={i} />
        ))}
      </ul>
    </div>
  );
}

export default function TagsForm({ tags, lang }: { tags: TagRow[]; lang: Lang }) {
  const t = getDict(lang);
  const [state, action, pending] = useActionState(createTag, undefined);
  const [newCategory, setNewCategory] = useState<TagCategory>("PERSONAL");

  const sorted = sortTagLikes(tags as TagLike[] as (TagRow & TagLike)[]);
  const language = sorted.filter((tag) => tag.category === "LANGUAGE");
  const personal = sorted.filter((tag) => tag.category === "PERSONAL");
  const systemeIo = sorted.filter((tag) => tag.category === "SYSTEME_IO");

  return (
    <div className="space-y-4">
      <CategoryGroup title={t.tagManagerSettings.categoryLanguage} tags={language} t={t} />
      <CategoryGroup title={t.tagManagerSettings.categoryPersonal} tags={personal} t={t} />
      <CategoryGroup title={t.tagManagerSettings.categorySystemeIo} tags={systemeIo} t={t} />
      {tags.length === 0 && <p className="text-sm text-soft">{t.tagManagerSettings.empty}</p>}

      <form action={action} className="flex flex-wrap items-center gap-2 border-t border-card-border pt-4">
        <input
          type="text"
          name="name"
          placeholder={t.tagManagerSettings.addName}
          className="min-w-[8rem] flex-1 rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30"
        />
        <select
          name="category"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as TagCategory)}
          className="rounded-md border border-card-border bg-field-bg px-2 py-1.5 text-sm text-ink shadow-sm"
        >
          <option value="LANGUAGE">{t.tagManagerSettings.categoryLanguage}</option>
          <option value="PERSONAL">{t.tagManagerSettings.categoryPersonal}</option>
          <option value="SYSTEME_IO">{t.tagManagerSettings.categorySystemeIo}</option>
        </select>
        <input type="color" name="color" defaultValue="#dbeafe" className="h-8 w-8 cursor-pointer rounded border border-card-border" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-card-border px-4 py-1.5 text-sm font-medium text-ink hover:bg-black/5 disabled:opacity-60"
        >
          {pending ? t.common.adding : t.tagManagerSettings.add}
        </button>
      </form>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}
    </div>
  );
}
