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
  // Always two columns: this week, then next week (or last week while next week has no data yet).
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
  const locale = fr ? "fr-CA" : "en-US";
  // "October 26, 2026" / "26 octobre 2026"
  const day = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(locale, { dateStyle: "long", timeZone: "UTC" });
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: "long", timeStyle: "short", timeZone: "America/Montreal" }) : "—");
  const mark = (ok: boolean | null) => (ok === true ? "✅" : ok === false ? "⚠️" : "❔");
  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{check.kind === "current"
          ? fr ? `Cette semaine (du ${day(check.weekStart)})` : `This week (starting ${day(check.weekStart)})`
          : check.kind === "next"
            ? fr ? `Semaine prochaine (du ${day(check.weekStart)})` : `Next week (starting ${day(check.weekStart)})`
            : fr ? `Semaine dernière (du ${day(check.weekStart)})` : `Last week (starting ${day(check.weekStart)})`}</h2>
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
        {check.rows.map((r) => {
          const st = r.platform === "tiktok" ? { ...ROW_STYLE.tiktok, iconBg: "bg-white", iconFill: "#000" } : ROW_STYLE[r.platform];
          const dark = r.platform === "tiktok";
          return (
            <div key={r.platform} className={`rounded-xl border border-black/10 p-3 ${st.rowBg} ${st.text}`}>
              <div className="flex items-center gap-2">
                <PlatformIcon platform={r.platform} style={st} />
                <span className="font-semibold">{platformNames[r.platform]}</span>
                <span className="ml-auto text-base" title={r.problem ?? undefined}>{mark(r.ok)}</span>
              </div>
              <div className={`mt-2 grid grid-cols-2 gap-3 text-xs`}>
                {(["EN", "FR"] as const).map((lg) => {
                  const d = r.langs[lg];
                  const lines: [string, string | number][] = [];
                  if (d.expected != null) lines.push([fr ? "Prévues" : "Expected", d.expected]);
                  // One queue: what waits in Make plus what waits in Buffer.
                  lines.push([fr ? "En file" : "Queue", (d.makeQueued ?? 0) + d.bufferQueued]);
                  if (check.current) lines.push([fr ? "Envoyées" : "Sent", d.bufferSent]);
                  if (d.sheetRecent != null) lines.push([fr ? "Feuille (7 j)" : "Sheet (7 d)", d.sheetRecent]);
                  if (d.sheetPending != null) lines.push([fr ? "En attente" : "Pending", d.sheetPending]);
                  const none = lines.every(([, v]) => v === 0 || v === "");
                  const pid = r.profileIds[lg];
                  return (
                    <div key={lg} className="min-w-0">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${dark ? "bg-white/15 text-white" : "bg-white/70 text-ink"}`}>
                        {lg === "EN" ? (fr ? "Anglais" : "English") : fr ? "Français" : "French"}
                      </span>
                      {none && d.expected == null ? (
                        <p className={`mt-2 ${st.soft}`}>—</p>
                      ) : (
                        <dl className="mt-2 space-y-0.5">
                          {lines.map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2">
                              <dt className={st.soft}>{k}</dt>
                              <dd className="font-semibold">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <p className={`mt-2 break-all text-[10px] ${st.soft}`} title={fr ? "Identifiant du profil" : "Profile ID"}>
                        {fr ? "ID profil" : "Profile ID"}: {pid ?? "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
              {r.expected != null && r.langs.EN.expected == null && r.langs.FR.expected == null && (
                <p className={`mt-2 text-xs ${st.soft}`}>{fr ? `Prévues (total) : ${r.expected}` : `Expected (total): ${r.expected}`}</p>
              )}
              {r.problem && <p className={`mt-2 text-xs ${dark ? "text-amber-300" : "text-amber-700"}`}>{r.problem}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
