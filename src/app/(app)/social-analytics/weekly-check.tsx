import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getWeeklyChecks, type WeeklyCheck as Check } from "@/lib/social-weekly";
import type { SocialPlatform } from "@/lib/social";
import { PlatformIcon, ROW_STYLE } from "../social-card";

// "Are next week's posts made and queued?" — the Thursday task's own report, checked against Buffer's queue and the
// recent runs of the Make scenarios that publish directly.
export default async function WeeklyCheck({ lang, platformNames }: { lang: "en" | "fr"; platformNames: Record<SocialPlatform, string> }) {
  const session = await auth();
  const checks = await withScopedPrismaClient((db) => getWeeklyChecks(db, session?.user.id));
  // Always two columns: this week and next week (a message replaces next week's card until it has data).
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {checks.map((check) => (
        <WeekCard key={check.weekStart} check={check} lang={lang} platformNames={platformNames} />
      ))}
    </div>
  );
}

function WeekCard({ check, lang, platformNames }: { check: Check; lang: "en" | "fr"; platformNames: Record<SocialPlatform, string> }) {
  const fr = lang === "fr";
  if (!check.hasData) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
        <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
        <h2 className="font-display text-lg font-semibold text-ink">{fr ? `Semaine prochaine (du ${check.weekStart})` : `Next week (starting ${check.weekStart})`}</h2>
        <p className="mt-2 text-sm text-soft">{fr ? "Aucune donnée disponible pour la semaine prochaine." : "No data available for next week."}</p>
      </div>
    );
  }
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(fr ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Montreal" }) : "—");
  const mark = (ok: boolean | null) => (ok === true ? "✅" : ok === false ? "⚠️" : "❔");
  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{check.current
          ? fr ? `Cette semaine (du ${check.weekStart})` : `This week (starting ${check.weekStart})`
          : fr ? `Semaine prochaine (du ${check.weekStart})` : `Next week (starting ${check.weekStart})`}</h2>
      <p className="mt-1 text-sm text-soft">
        {check.report
          ? fr
            ? `Rapport de la tâche Claude : ${when(check.report.reportedAt)} — ${check.report.status === "success" ? "terminée avec succès" : "terminée avec des erreurs"}.`
            : `Claude task report: ${when(check.report.reportedAt)} — ${check.report.status === "success" ? "finished successfully" : "finished with errors"}.`
          : check.reportMissing
            ? fr ? "⚠️ Aucun rapport reçu de la tâche Claude du jeudi pour cette semaine." : "⚠️ No report received from Thursday's Claude task for this week."
            : fr ? "Le rapport de la tâche Claude arrive le jeudi." : "The Claude task reports on Thursday."}
      </p>
      {check.report?.note && <p className="mt-1 text-xs text-soft">{check.report.note}</p>}
      {check.report?.errors.map((e, i) => <p key={i} className="mt-1 text-xs text-red-600">{e}</p>)}
      {check.failedInMake ? (
        <p className="mt-2 text-xs text-amber-700">
          {fr ? `⚠️ ${check.failedInMake} publication(s) échouée(s) conservée(s) dans Make (« Failed Social Posts »).` : `⚠️ ${check.failedInMake} failed post(s) are kept in Make ("Failed Social Posts").`}
        </p>
      ) : null}
      {check.makeError && <p className="mt-2 text-xs text-amber-700">{fr ? "File d'attente Make illisible : " : "Could not read the Make queue: "}{check.makeError}</p>}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {check.rows.map((r) => (
          <div key={r.platform} className="rounded-xl border border-card-border bg-card-bg/60 p-3">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={r.platform} style={r.platform === "tiktok" ? { ...ROW_STYLE.tiktok, iconBg: "bg-black", iconFill: "#fff" } : ROW_STYLE[r.platform]} />
              <span className="font-medium text-ink">{platformNames[r.platform]}</span>
              <span className="ml-auto text-base" title={r.problem ?? undefined}>{mark(r.ok)}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 divide-x divide-card-border text-xs">
              {(["EN", "FR"] as const).map((lg) => {
                const d = r.langs[lg];
                const lines: [string, string | number][] = [];
                if (d.expected != null) lines.push([fr ? "Prévues" : "Expected", d.expected]);
                if (d.makeQueued != null && !(r.platform === "tiktok")) lines.push([fr ? "Make en file" : "Make queue", d.makeQueued]);
                lines.push(["Buffer " + (fr ? "en file" : "queue"), d.bufferQueued]);
                if (check.current) lines.push(["Buffer " + (fr ? "envoyées" : "sent"), d.bufferSent]);
                if (d.sheetRecent != null) lines.push([fr ? "Feuille (7 j)" : "Sheet (7 d)", d.sheetRecent]);
                if (d.sheetPending != null) lines.push([fr ? "En attente" : "Pending", d.sheetPending]);
                const none = lines.every(([, v]) => v === 0 || v === "");
                return (
                  <div key={lg} className={lg === "FR" ? "pl-3" : "pr-3"}>
                    <p className="mb-1 font-semibold uppercase tracking-wide text-soft">{lg}</p>
                    {none && d.expected == null ? (
                      <p className="text-soft">—</p>
                    ) : (
                      <dl className="space-y-0.5">
                        {lines.filter(([k]) => k).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <dt className="text-soft">{k}</dt>
                            <dd className="font-semibold text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
            {r.expected != null && r.langs.EN.expected == null && r.langs.FR.expected == null && (
              <p className="mt-2 text-xs text-soft">{fr ? `Prévues (total) : ${r.expected}` : `Expected (total): ${r.expected}`}</p>
            )}
            {r.problem && <p className="mt-2 text-xs text-amber-700">{r.problem}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
