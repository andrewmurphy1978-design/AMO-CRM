"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { addAiMembership, updateAiMembership, deleteAiMembership } from "@/actions/ai-memberships";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

export type MembershipUsage = "DAILY" | "WEEKLY" | "MONTHLY" | "RARELY";

export interface MembershipRow {
  id: string;
  name: string;
  plan: string | null;
  isFree: boolean;
  costUsdMonthly: number | null;
  costCadMonthly: number | null;
  creditsAvailable: number | null;
  creditsPerMonth: number | null;
  rolloverCredits: number | null;
  renewsAt: string | null; // yyyy-mm-dd
  daysRemaining: number | null;
  usage: MembershipUsage;
  notes: string | null;
  // The matching AffiliateProgram (AI_TOOLS tab, matched by name) if one
  // exists — accountPlan is that program's own "Account / Plan / Trial
  // End" field, which is how an existing account is confirmed.
  account: { programId: string; accountPlan: string | null } | null;
}

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30 disabled:opacity-50";

function fmtMoney(n: number | null, locale: string, currency: string) {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

function fmtDate(ymd: string | null, locale: string) {
  if (!ymd) return "—";
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });
}

function usageBadgeClass(usage: MembershipUsage) {
  switch (usage) {
    case "DAILY":
      return "bg-emerald-100 text-emerald-800";
    case "WEEKLY":
      return "bg-sky-100 text-sky-800";
    case "MONTHLY":
      return "bg-amber-100 text-amber-800";
    case "RARELY":
      return "bg-gray-100 text-gray-600";
  }
}

function usageLabel(usage: MembershipUsage, t: ReturnType<typeof getDict>["aiMemberships"]) {
  switch (usage) {
    case "DAILY":
      return t.usageDaily;
    case "WEEKLY":
      return t.usageWeekly;
    case "MONTHLY":
      return t.usageMonthly;
    case "RARELY":
      return t.usageRarely;
  }
}

function DaysBadge({ daysRemaining, t }: { daysRemaining: number | null; t: ReturnType<typeof getDict>["aiMemberships"] }) {
  if (daysRemaining == null) return <span className="text-soft">{t.noRenewalDate}</span>;
  if (daysRemaining < 0) return <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-600">{t.overdue}</span>;
  if (daysRemaining === 0) return <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{t.dueToday}</span>;
  return <span className="text-soft">{t.daysRemaining.replace("{n}", String(daysRemaining))}</span>;
}

function AccountBadge({ row, t }: { row: MembershipRow; t: ReturnType<typeof getDict>["aiMemberships"] }) {
  if (!row.account) {
    return <span className="inline-flex rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-500">{t.accountNotTracked}</span>;
  }
  const label = row.account.accountPlan ? t.accountConfirmed.replace("{plan}", row.account.accountPlan) : t.accountNoPlan;
  const style = row.account.accountPlan ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700";
  return (
    <Link href={`/marketing/programs/${row.account.programId}`} title={t.viewProgram} className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium hover:underline ${style}`}>
      {label}
    </Link>
  );
}

function Fields({ lang, initial }: { lang: Lang; initial?: Partial<MembershipRow> }) {
  const t = getDict(lang).aiMemberships;
  const [free, setFree] = useState(initial?.isFree ?? false);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <input name="name" defaultValue={initial?.name ?? ""} placeholder={t.namePlaceholder} className={FIELD_CLASS} />
      <input name="plan" defaultValue={initial?.plan ?? ""} placeholder={t.planPlaceholder} className={FIELD_CLASS} />
      <label className="col-span-full -mt-1 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isFree" defaultChecked={initial?.isFree ?? false} onChange={(e) => setFree(e.target.checked)} className="accent-amo-lime" />
        {t.freeLabel}
      </label>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.costUsdLabel}</label>
        <input type="number" step="0.01" min="0" name="costUsdMonthly" disabled={free} defaultValue={initial?.costUsdMonthly ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.costCadLabel}</label>
        <input type="number" step="0.01" min="0" name="costCadMonthly" disabled={free} defaultValue={initial?.costCadMonthly ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.creditsAvailableLabel}</label>
        <input type="number" step="any" name="creditsAvailable" defaultValue={initial?.creditsAvailable ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.creditsPerMonthLabel}</label>
        <input type="number" step="any" name="creditsPerMonth" defaultValue={initial?.creditsPerMonth ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.rolloverCreditsLabel}</label>
        <input type="number" step="any" name="rolloverCredits" defaultValue={initial?.rolloverCredits ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.renewsAtLabel}</label>
        <input type="date" name="renewsAt" defaultValue={initial?.renewsAt ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="col-span-full sm:col-span-1">
        <label className="block text-xs font-semibold uppercase tracking-wide text-soft">{t.usageLabel}</label>
        <select name="usage" defaultValue={initial?.usage ?? "MONTHLY"} className={FIELD_CLASS}>
          <option value="DAILY">{t.usageDaily}</option>
          <option value="WEEKLY">{t.usageWeekly}</option>
          <option value="MONTHLY">{t.usageMonthly}</option>
          <option value="RARELY">{t.usageRarely}</option>
        </select>
      </div>
      <textarea name="notes" defaultValue={initial?.notes ?? ""} placeholder={t.notesPlaceholder} rows={2} className={`${FIELD_CLASS} col-span-full`} />
    </div>
  );
}

function EntryRow({ row, lang }: { row: MembershipRow; lang: Lang }) {
  const t = getDict(lang).aiMemberships;
  const locale = lang === "fr" ? "fr-CA" : "en-US";
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    startTransition(() => deleteAiMembership(row.id));
  }

  const totalCredits = row.creditsPerMonth != null ? row.creditsPerMonth + (row.rolloverCredits ?? 0) : null;
  const pct = totalCredits != null && totalCredits > 0 && row.creditsAvailable != null ? Math.round((row.creditsAvailable / totalCredits) * 100) : null;

  if (editing) {
    return (
      <li className="rounded-xl border border-card-border p-3 sm:p-4">
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await updateAiMembership(row.id, fd);
              if (res.error) setError(res.error);
              else {
                setError(null);
                setEditing(false);
              }
            })
          }
        >
          <Fields lang={lang} initial={row} />
          <div className="mt-2 flex items-center gap-2">
            <button type="submit" disabled={pending} className="btn-primary rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60">
              {pending ? t.saving : t.save}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm font-medium text-soft hover:underline">
              {t.cancel}
            </button>
          </div>
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-card-border p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{row.name}</span>
            {row.plan && <span className="text-xs text-soft">({row.plan})</span>}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${usageBadgeClass(row.usage)}`}>{usageLabel(row.usage, t)}</span>
            {row.isFree && <span className="rounded-full bg-lime-100 px-2 py-0.5 text-[11px] font-medium text-lime-800">{t.free}</span>}
          </div>
          <div className="mt-1">
            <AccountBadge row={row} t={t} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-soft hover:underline">
            {t.editEntry}
          </button>
          <button type="button" onClick={remove} disabled={pending} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60">
            {t.deleteEntry}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-soft">{t.perMonthUsd}</dt>
          <dd className="font-semibold text-ink">{row.isFree ? t.free : fmtMoney(row.costUsdMonthly, locale, "USD")}</dd>
        </div>
        <div>
          <dt className="text-soft">{t.perMonthCad}</dt>
          <dd className="font-semibold text-ink">{row.isFree ? t.free : fmtMoney(row.costCadMonthly, locale, "CAD")}</dd>
        </div>
        <div>
          <dt className="text-soft">{t.credits}</dt>
          <dd className="font-semibold text-ink">
            {row.creditsAvailable ?? "—"}
            {row.creditsPerMonth != null && (
              <>
                {" "}
                {t.of} {row.creditsPerMonth}
              </>
            )}
            {row.rolloverCredits ? ` (+${row.rolloverCredits} ${t.rollover})` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-soft">%</dt>
          <dd className="font-semibold text-ink">{pct != null ? `${pct}% ${t.remaining}` : "—"}</dd>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-soft">
          {t.renews}: {fmtDate(row.renewsAt, locale)}
        </span>
        <DaysBadge daysRemaining={row.daysRemaining} t={t} />
      </div>

      {row.notes && <p className="mt-2 text-xs text-soft">{row.notes}</p>}
    </li>
  );
}

export default function AiMembershipsList({
  rows,
  totalUsd,
  totalCad,
  lang,
}: {
  rows: MembershipRow[];
  totalUsd: number;
  totalCad: number;
  lang: Lang;
}) {
  const t = getDict(lang).aiMemberships;
  const locale = lang === "fr" ? "fr-CA" : "en-US";
  const [state, action, pending] = useActionState(addAiMembership, undefined);
  // Remounts the (uncontrolled) fields after a successful add — otherwise
  // the Free checkbox's own local state in Fields survives the submit, so
  // the next entry's cost inputs can be left disabled from the previous one.
  const [formKey, setFormKey] = useState(0);
  useEffect(() => {
    if (state?.success) setFormKey((k) => k + 1);
  }, [state]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-card-border bg-card-bg p-3 sm:p-4">
        <span className="text-sm font-medium text-ink">{t.totalLabel}</span>
        <span className="text-sm font-semibold text-ink">
          {fmtMoney(totalUsd, locale, "USD")} · {fmtMoney(totalCad, locale, "CAD")}
        </span>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => (
          <EntryRow key={row.id} row={row} lang={lang} />
        ))}
        {rows.length === 0 && <li className="text-sm text-soft">{t.empty}</li>}
      </ul>

      <form key={formKey} action={action} className="space-y-2 rounded-xl border border-card-border p-3 sm:p-4">
        <p className="text-sm font-semibold text-ink">{t.addNew}</p>
        <Fields lang={lang} />
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending} className="btn-primary rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60">
            {pending ? t.saving : t.save}
          </button>
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
    </div>
  );
}
