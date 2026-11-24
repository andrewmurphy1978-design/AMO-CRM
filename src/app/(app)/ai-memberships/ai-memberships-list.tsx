"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addAiMembership, updateAiMembership, deleteAiMembership } from "@/actions/ai-memberships";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";
import Card, { type CardColor } from "@/components/section-card";
import SectionDialog, { FIELD_CLASS, LABEL_CLASS } from "../contacts/[id]/section-dialog";

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

type T = ReturnType<typeof getDict>["aiMemberships"];

const DIALOG_HEADER = "bg-indigo-600";

function fmtMoney(n: number | null, locale: string, currency: string) {
  if (n == null) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(n);
}

function fmtNumber(n: number | null, locale: string) {
  return n == null ? "—" : n.toLocaleString(locale);
}

function fmtDate(ymd: string | null, locale: string) {
  if (!ymd) return "—";
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" });
}

// Badge + left-border stripe per usage level — the same "colored stripe on
// each row" idea as the Affiliate Programs list's status colors.
const USAGE_STYLE: Record<MembershipUsage, { badge: string; border: string }> = {
  DAILY: { badge: "bg-emerald-100 text-emerald-800", border: "border-l-emerald-500" },
  WEEKLY: { badge: "bg-sky-100 text-sky-800", border: "border-l-sky-500" },
  MONTHLY: { badge: "bg-amber-100 text-amber-800", border: "border-l-amber-500" },
  RARELY: { badge: "bg-gray-100 text-gray-600", border: "border-l-gray-300" },
};

function usageLabel(usage: MembershipUsage, t: T) {
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

function pctRemaining(row: MembershipRow) {
  const total = row.creditsPerMonth != null ? row.creditsPerMonth + (row.rolloverCredits ?? 0) : null;
  return total != null && total > 0 && row.creditsAvailable != null ? Math.round((row.creditsAvailable / total) * 100) : null;
}

function daysText(daysRemaining: number | null, t: T) {
  if (daysRemaining == null) return null;
  if (daysRemaining < 0) return <span className="font-medium text-red-600">{t.overdue}</span>;
  if (daysRemaining === 0) return <span className="font-medium text-amber-700">{t.dueToday}</span>;
  return <span className={daysRemaining <= 7 ? "font-medium text-amber-700" : "text-soft"}>{t.daysRemaining.replace("{n}", String(daysRemaining))}</span>;
}

function UsageBadge({ usage, t }: { usage: MembershipUsage; t: T }) {
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${USAGE_STYLE[usage].badge}`}>{usageLabel(usage, t)}</span>;
}

function AccountCell({ row, t }: { row: MembershipRow; t: T }) {
  if (!row.account) return <span className="text-ink/50">—</span>;
  const label = row.account.accountPlan ?? t.accountNoPlanShort;
  return (
    <Link
      href={`/marketing/programs/${row.account.programId}`}
      title={`${t.viewProgram}: ${label}`}
      onClick={(e) => e.stopPropagation()}
      className={`block truncate hover:underline ${row.account.accountPlan ? "text-emerald-700" : "text-amber-700"}`}
    >
      {label}
    </Link>
  );
}

function Fields({ lang, initial }: { lang: Lang; initial?: Partial<MembershipRow> }) {
  const t = getDict(lang).aiMemberships;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className={LABEL_CLASS}>{t.nameLabel}</label>
        <input name="name" defaultValue={initial?.name ?? ""} placeholder={t.namePlaceholder} className={FIELD_CLASS} />
      </div>
      <div>
        <label className={LABEL_CLASS}>{t.planLabel}</label>
        <input name="plan" defaultValue={initial?.plan ?? ""} placeholder={t.planPlaceholder} className={FIELD_CLASS} />
      </div>
      <label className="col-span-full flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="isFree" defaultChecked={initial?.isFree ?? false} className="accent-amo-lime" />
        {t.freeLabel}
      </label>
      {/* Left enabled even when Free is checked — the server zeroes these
          out for a free plan regardless of what's typed here (see
          addAiMembership/updateAiMembership), so there's no state to keep
          in sync with the checkbox on an uncontrolled form. */}
      <div>
        <label className={LABEL_CLASS}>{t.costUsdLabel}</label>
        <input type="number" step="0.01" min="0" name="costUsdMonthly" defaultValue={initial?.costUsdMonthly ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className={LABEL_CLASS}>{t.costCadLabel}</label>
        <input type="number" step="0.01" min="0" name="costCadMonthly" defaultValue={initial?.costCadMonthly ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className={LABEL_CLASS}>{t.creditsAvailableLabel}</label>
        <input type="number" step="any" name="creditsAvailable" defaultValue={initial?.creditsAvailable ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className={LABEL_CLASS}>{t.creditsPerMonthLabel}</label>
        <input type="number" step="any" name="creditsPerMonth" defaultValue={initial?.creditsPerMonth ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className={LABEL_CLASS}>{t.rolloverCreditsLabel}</label>
        <input type="number" step="any" name="rolloverCredits" defaultValue={initial?.rolloverCredits ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className={LABEL_CLASS}>{t.renewsAtLabel}</label>
        <input type="date" name="renewsAt" defaultValue={initial?.renewsAt ?? ""} className={FIELD_CLASS} />
      </div>
      <div>
        <label className={LABEL_CLASS}>{t.usageLabel}</label>
        <select name="usage" defaultValue={initial?.usage ?? "MONTHLY"} className={FIELD_CLASS}>
          <option value="DAILY">{t.usageDaily}</option>
          <option value="WEEKLY">{t.usageWeekly}</option>
          <option value="MONTHLY">{t.usageMonthly}</option>
          <option value="RARELY">{t.usageRarely}</option>
        </select>
      </div>
      <div className="col-span-full">
        <label className={LABEL_CLASS}>{t.notesLabel}</label>
        <textarea name="notes" defaultValue={initial?.notes ?? ""} placeholder={t.notesPlaceholder} rows={3} className={FIELD_CLASS} />
      </div>
    </div>
  );
}

// The page header's "Add membership" button — same look as the Affiliate
// Programs page's "New program" button (bare icon on mobile).
export function AddMembershipButton({ lang }: { lang: Lang }) {
  const t = getDict(lang).aiMemberships;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t.addNew}
        aria-label={t.addNew}
        className="btn-primary flex items-center justify-center rounded-lg p-1.5 shadow-sm sm:justify-start sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-sm sm:font-semibold"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
        <span className="hidden sm:inline">{t.addNew}</span>
      </button>
      <SectionDialog
        open={open}
        onOpenChange={setOpen}
        title={t.addNew}
        action={addAiMembership}
        labels={{ cancel: t.cancel, save: t.save, saving: t.saving }}
        headerColorClassName={DIALOG_HEADER}
        wide
      >
        <Fields lang={lang} />
      </SectionDialog>
    </>
  );
}

function EditDialog({ row, lang, onClose }: { row: MembershipRow; lang: Lang; onClose: () => void }) {
  const t = getDict(lang).aiMemberships;
  const [deleting, startDelete] = useTransition();

  function remove() {
    if (!window.confirm(t.confirmDelete.replace("{name}", row.name))) return;
    startDelete(async () => {
      await deleteAiMembership(row.id);
      onClose();
    });
  }

  return (
    <SectionDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${t.editEntry} — ${row.name}`}
      action={updateAiMembership.bind(null, row.id)}
      labels={{ cancel: t.cancel, save: t.save, saving: t.saving }}
      headerColorClassName={DIALOG_HEADER}
      wide
      headerExtra={
        <button
          type="button"
          onClick={remove}
          disabled={deleting}
          title={t.deleteEntry}
          className="flex items-center gap-1.5 rounded-md bg-white/20 px-2 py-1.5 text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
            />
          </svg>
          <span className="hidden sm:inline">{t.deleteEntry}</span>
        </button>
      }
    >
      <Fields lang={lang} initial={row} />
    </SectionDialog>
  );
}

function MembershipCard({
  color,
  title,
  rows,
  lang,
  onEdit,
}: {
  color: CardColor;
  title: string;
  rows: MembershipRow[];
  lang: Lang;
  onEdit: (id: string) => void;
}) {
  const t = getDict(lang).aiMemberships;
  const locale = lang === "fr" ? "fr-CA" : "en-US";

  return (
    <Card
      color={color}
      title={
        <>
          {title}
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{rows.length}</span>
        </>
      }
    >
      {/* Same mobile padding trick as the Affiliate Programs cards: drop
          Card's p-4 on phones for a smaller fixed gutter. */}
      <div className="-m-4 p-2 sm:m-0 sm:p-0">
        {rows.length === 0 ? (
          <p className="text-sm text-soft">{t.empty}</p>
        ) : (
          <>
            {/* Mobile: 2-line rows. Line 1: name, plan, usage. Line 2: cost
                and renewal, credits left on the right. */}
            <div className="divide-y divide-card-border sm:hidden">
              {rows.map((row) => {
                const pct = pctRemaining(row);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onEdit(row.id)}
                    className={`block w-full border-l-4 px-2 py-1.5 text-left hover:bg-black/[0.03] ${USAGE_STYLE[row.usage].border}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                        {row.name}
                        {row.plan && <span className="ml-1 text-xs font-normal text-soft">{row.plan}</span>}
                      </span>
                      <UsageBadge usage={row.usage} t={t} />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink/70">
                      <span className="min-w-0 flex-1 truncate">
                        {row.isFree ? t.free : row.costCadMonthly == null ? "—" : `${fmtMoney(row.costCadMonthly, locale, "CAD")}${t.perMonthShort}`}
                        {row.renewsAt && (
                          <>
                            {" · "}
                            {daysText(row.daysRemaining, t)}
                          </>
                        )}
                      </span>
                      {pct != null && <span className="shrink-0">{pct}%</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop/tablet: table-fixed + a shared colgroup so both cards'
                columns line up, same as the Affiliate Programs tables. */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full table-fixed divide-y divide-card-border text-sm">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[9%]" />
                  <col className="w-[14%]" />
                  <col className="w-[7%]" />
                  <col className="w-[13%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead className="text-left text-xs font-medium uppercase tracking-wide text-soft">
                  <tr>
                    <th className="py-2 pr-4 pl-3">{t.colMembership}</th>
                    <th className="py-2 pr-4">{t.colUsage}</th>
                    <th className="py-2 pr-4 text-right">{t.perMonthUsd}</th>
                    <th className="py-2 pr-4 text-right">{t.perMonthCad}</th>
                    <th className="py-2 pr-4 text-right">{t.colCredits}</th>
                    <th className="py-2 pr-4 text-right">{t.colRemaining}</th>
                    <th className="py-2 pr-4">{t.colRenews}</th>
                    <th className="py-2 pr-2">{t.colAccount}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border">
                  {rows.map((row) => {
                    const pct = pctRemaining(row);
                    return (
                      <tr key={row.id} onClick={() => onEdit(row.id)} title={row.notes ?? undefined} className="cursor-pointer hover:bg-black/[0.03]">
                        <td className={`border-l-4 py-2 pr-4 pl-3 align-top ${USAGE_STYLE[row.usage].border}`}>
                          <button type="button" className="block max-w-full truncate text-left font-medium text-ink hover:underline">
                            {row.name}
                          </button>
                          {row.plan && <span className="block truncate text-xs text-soft">{row.plan}</span>}
                        </td>
                        <td className="py-2 pr-4 align-top">
                          <UsageBadge usage={row.usage} t={t} />
                        </td>
                        <td className="truncate py-2 pr-4 text-right align-top tabular-nums text-ink/80">
                          {row.isFree ? t.free : fmtMoney(row.costUsdMonthly, locale, "USD")}
                        </td>
                        <td className="truncate py-2 pr-4 text-right align-top font-medium tabular-nums text-ink">
                          {row.isFree ? t.free : fmtMoney(row.costCadMonthly, locale, "CAD")}
                        </td>
                        <td className="py-2 pr-4 text-right align-top tabular-nums text-ink/80">
                          {row.creditsAvailable == null && row.creditsPerMonth == null ? (
                            "—"
                          ) : (
                            <>
                              <span className="block truncate">
                                {fmtNumber(row.creditsAvailable, locale)} / {fmtNumber(row.creditsPerMonth, locale)}
                              </span>
                              {row.rolloverCredits ? (
                                <span className="block truncate text-xs text-soft">
                                  +{fmtNumber(row.rolloverCredits, locale)} {t.rollover}
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right align-top tabular-nums text-ink/80">{pct != null ? `${pct}%` : "—"}</td>
                        <td className="py-2 pr-4 align-top">
                          <span className="block truncate text-ink/80">{fmtDate(row.renewsAt, locale)}</span>
                          {row.renewsAt && <span className="block truncate text-xs">{daysText(row.daysRemaining, t)}</span>}
                        </td>
                        <td className="py-2 pr-2 align-top text-xs">
                          <AccountCell row={row} t={t} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Card>
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = editingId ? rows.find((r) => r.id === editingId) : undefined;
  const paid = rows.filter((r) => !r.isFree);
  const free = rows.filter((r) => r.isFree);

  return (
    <div className="flex flex-col gap-2 sm:gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-amo-lime/15 px-3 py-1.5 text-sm font-semibold text-emerald-800">
          {t.totalLabel}: {fmtMoney(totalCad, locale, "CAD")} · {fmtMoney(totalUsd, locale, "USD")}
        </span>
        <span className="ml-auto rounded-full bg-amo-lime/15 px-3 py-1.5 text-sm font-semibold text-emerald-800">{t.shown(rows.length)}</span>
      </div>

      <MembershipCard color="aiDetails" title={t.paidTitle} rows={paid} lang={lang} onEdit={setEditingId} />
      <MembershipCard color="marketingActive" title={t.freeTitle} rows={free} lang={lang} onEdit={setEditingId} />

      {/* Keyed per row: a fresh dialog (and fresh fields) for each membership opened. */}
      {editingRow && <EditDialog key={editingRow.id} row={editingRow} lang={lang} onClose={() => setEditingId(null)} />}
    </div>
  );
}
