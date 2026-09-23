"use client";

import { useActionState } from "react";
import { saveDefaultComposeAccount, saveDefaultComposeFont } from "@/actions/users";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FONT_FAMILIES = [
  { value: "", label: "Browser default" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Tahoma, Geneva, sans-serif", label: "Tahoma" },
];

const FONT_SIZES = [
  { value: "", label: "Browser default" },
  { value: "13px", label: "Small" },
  { value: "14px", label: "Normal" },
  { value: "16px", label: "Large" },
  { value: "18px", label: "Huge" },
];

export default function EmailComposePreferencesForm({
  lang,
  accounts,
  defaultComposeSource,
  defaultFontFamily,
  defaultFontSize,
}: {
  lang: Lang;
  accounts: { source: string; address: string }[];
  defaultComposeSource: string | null;
  defaultFontFamily: string | null;
  defaultFontSize: string | null;
}) {
  const t = getDict(lang);
  const [accountState, accountAction, accountPending] = useActionState(saveDefaultComposeAccount, undefined);
  const [fontState, fontAction, fontPending] = useActionState(saveDefaultComposeFont, undefined);

  return (
    <div className="space-y-5">
      {accounts.length > 1 && (
        <form action={accountAction}>
          <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.emailComposeSettings.defaultAccountLabel}</label>
          <p className="mt-1 text-xs text-soft">{t.emailComposeSettings.defaultAccountDesc}</p>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            {accounts.map((a) => (
              <label key={a.address} className="flex items-center gap-2 text-sm text-ink">
                <input type="radio" name="defaultComposeSource" value={a.source} defaultChecked={defaultComposeSource === a.source} />
                {a.address}
              </label>
            ))}
            <button type="submit" disabled={accountPending} className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60">
              {accountPending ? t.emailComposeSettings.saving : t.emailComposeSettings.save}
            </button>
          </div>
          {accountState?.error && <p className="mt-2 text-sm text-red-600">{accountState.error}</p>}
          {accountState?.success && <p className="mt-2 text-sm text-emerald-700">{accountState.success}</p>}
        </form>
      )}

      <form action={fontAction} className={accounts.length > 1 ? "border-t border-card-border pt-5" : ""}>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.emailComposeSettings.defaultFontLabel}</label>
        <p className="mt-1 text-xs text-soft">{t.emailComposeSettings.defaultFontDesc}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <select name="defaultFontFamily" defaultValue={defaultFontFamily ?? ""} className="rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">
            {FONT_FAMILIES.map((f) => (
              <option key={f.label} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select name="defaultFontSize" defaultValue={defaultFontSize ?? ""} className="rounded-md border border-card-border bg-field-bg px-3 py-1.5 text-sm text-ink">
            {FONT_SIZES.map((s) => (
              <option key={s.label} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={fontPending} className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm disabled:opacity-60">
            {fontPending ? t.emailComposeSettings.saving : t.emailComposeSettings.save}
          </button>
        </div>
        {fontState?.error && <p className="mt-2 text-sm text-red-600">{fontState.error}</p>}
        {fontState?.success && <p className="mt-2 text-sm text-emerald-700">{fontState.success}</p>}
      </form>
    </div>
  );
}
