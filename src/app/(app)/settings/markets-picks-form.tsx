"use client";

import { useActionState, useState } from "react";
import { saveMarketsSettings } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import {
  MAX_MARKET_ITEMS,
  MARKET_CURRENCY_OPTIONS,
  MARKET_ITEM_OPTIONS,
  type MarketItemGroup,
} from "@/lib/dashboard-markets-picks";

const GROUPS: MarketItemGroup[] = ["index", "commodity", "crypto"];

export default function MarketsPicksForm({
  lang,
  initialCurrency,
  initialItems,
  initialItemMobile,
}: {
  lang: Lang;
  initialCurrency: string;
  initialItems: string[];
  initialItemMobile: string | null;
}) {
  const t = getDict(lang);
  const [state, formAction, pending] = useActionState(saveMarketsSettings, undefined);
  const [currency, setCurrency] = useState(initialCurrency);
  const [items, setItems] = useState(initialItems);
  const [itemMobile, setItemMobile] = useState(initialItemMobile ?? "");

  function toggleItem(key: string) {
    setItems((prev) => {
      if (prev.includes(key)) {
        setItemMobile((m) => (m === key ? "" : m));
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= MAX_MARKET_ITEMS) return prev;
      return [...prev, key];
    });
  }

  const groupLabel: Record<MarketItemGroup, string> = {
    index: t.settings.marketsPicksIndices,
    commodity: t.settings.marketsPicksCommodities,
    crypto: t.settings.marketsPicksCrypto,
  };

  return (
    <form action={formAction} className="mt-6 border-t border-card-border pt-5">
      <input type="hidden" name="marketsCurrency" value={currency} />
      {items.map((key) => (
        <input key={key} type="hidden" name="marketsItems" value={key} />
      ))}
      <input type="hidden" name="marketsItemMobile" value={itemMobile} />

      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
        {t.settings.marketsPicksLabel}
      </label>
      <p className="mt-1 text-xs text-soft">{t.settings.marketsPicksDesc}</p>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-soft">
          {t.settings.marketsPicksCurrencyLabel}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {MARKET_CURRENCY_OPTIONS.map((code) => (
            <label
              key={code}
              className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                currency === code ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
              }`}
            >
              <input
                type="radio"
                name="marketsCurrencyRadio"
                checked={currency === code}
                onChange={() => setCurrency(code)}
                className="h-3.5 w-3.5"
              />
              {code}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-soft">
          {t.settings.marketsPicksItemsLabel}
        </p>
        <div className="mt-1.5 space-y-2">
          {GROUPS.map((group) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-soft/70">{groupLabel[group]}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {MARKET_ITEM_OPTIONS.filter((o) => o.group === group).map((opt) => {
                  const checked = items.includes(opt.key);
                  return (
                    <label
                      key={opt.key}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                        checked ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleItem(opt.key)}
                        disabled={!checked && items.length >= MAX_MARKET_ITEMS}
                        className="h-3.5 w-3.5 rounded border-card-border"
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">
            {t.settings.marketsPicksItemMobileLabel}
          </label>
          <p className="mt-1 text-xs text-soft">{t.settings.marketsPicksItemMobileDesc}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {items.map((key) => {
              const checked = itemMobile === key;
              const label = MARKET_ITEM_OPTIONS.find((o) => o.key === key)?.label ?? key;
              return (
                <label
                  key={key}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    checked ? "border-amo-gold bg-amo-gold/10 text-ink" : "border-card-border text-soft"
                  }`}
                >
                  <input
                    type="radio"
                    name="marketsItemMobileRadio"
                    checked={checked}
                    onChange={() => setItemMobile(key)}
                    className="h-3.5 w-3.5"
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary mt-4 rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.settings.marketsPicksSaving : t.settings.marketsPicksSave}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="mt-2 text-sm text-emerald-700">{state.success}</p>}
    </form>
  );
}
