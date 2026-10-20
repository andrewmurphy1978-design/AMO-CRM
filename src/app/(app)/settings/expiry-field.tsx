"use client";

import { useState } from "react";
import { expiryState, type ExpiryInfo } from "@/lib/api-key-expiry-shared";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30 disabled:opacity-50";

// Where the saved key stands: expired (red), expiring within 14 days (amber), a date, or no expiry.
export function ExpiryBadge({ expiry, lang }: { expiry: ExpiryInfo | undefined; lang: Lang }) {
  const t = getDict(lang).apiVault;
  if (!expiry) return null;
  const { state, days } = expiryState(expiry.expiresAt, expiry.noExpiry);
  if (expiry.noExpiry) return <span className="text-xs text-soft">{t.neverExpires}</span>;
  if (!expiry.expiresAt) return <span className="text-xs text-soft">{t.noDate}</span>;
  const date = new Date(expiry.expiresAt).toLocaleDateString(lang === "fr" ? "fr-CA" : "en-CA");
  if (state === "expired") return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">{t.expiredOn} {date}</span>;
  if (state === "soon") return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{t.expiresOn} {date} — {t.expiresSoon.replace("{n}", String(days))}</span>;
  return <span className="text-xs text-soft">{t.expiresOn} {date}</span>;
}

// The expiry fields asked next to every API key paste: a date, or "doesn't expire".
export default function ExpiryField({ lang, current }: { lang: Lang; current?: ExpiryInfo }) {
  const t = getDict(lang).apiVault;
  const [none, setNone] = useState(false);
  return (
    <div className="min-w-[220px]">
      <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.expiryLabel}</label>
      <input type="date" name="expiresAt" disabled={none} className={FIELD_CLASS} />
      <label className="mt-1 flex items-center gap-2 text-xs text-ink">
        <input type="checkbox" name="noExpiry" checked={none} onChange={(e) => setNone(e.target.checked)} className="accent-amo-lime" />
        {t.noExpiry}
      </label>
      {current && (
        <p className="mt-1">
          <ExpiryBadge expiry={current} lang={lang} />
        </p>
      )}
    </div>
  );
}
