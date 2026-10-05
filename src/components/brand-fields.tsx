"use client";

import { useState } from "react";
import { BRAND_ITEMS, DEFAULT_BRAND_ITEMS } from "@/lib/brand-items";

// "Create a brand for the client" + what the brand should include. Posts `createBrand`
// and one `brandItems` entry per ticked item (each becomes a task of the Brand phase).
export default function BrandFields({ defaultChecked, defaultItems, lang }: { defaultChecked: boolean; defaultItems: string[]; lang: "en" | "fr" }) {
  const fr = lang === "fr";
  const [on, setOn] = useState(defaultChecked);
  const [items, setItems] = useState<string[]>(defaultItems.length > 0 ? defaultItems : DEFAULT_BRAND_ITEMS);
  return (
    <div className="rounded-lg border border-card-border p-3">
      <label className="flex items-start gap-2 text-sm text-ink">
        <input type="checkbox" name="createBrand" checked={on} onChange={(e) => setOn(e.target.checked)} className="mt-1" />
        <span>{fr ? "Créer l'image de marque du client (ajoute la phase Marque)" : "Create a brand for the client (adds the Brand phase)"}</span>
      </label>
      {on && (
        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">{fr ? "Ce que la marque doit inclure" : "What the brand should include"}</p>
          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            {BRAND_ITEMS.map((b) => (
              <label key={b.key} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="brandItems"
                  value={b.key}
                  checked={items.includes(b.key)}
                  onChange={(e) => setItems((cur) => (e.target.checked ? [...cur, b.key] : cur.filter((k) => k !== b.key)))}
                />
                {fr ? b.labelFr : b.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
