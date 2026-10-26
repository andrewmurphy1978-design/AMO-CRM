import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getWeeklyCheck } from "@/lib/social-weekly";
import type { SocialPlatform } from "@/lib/social";

// "Are next week's posts made and queued?" — the Thursday task's own report, checked against Buffer's queue and the
// recent runs of the Make scenarios that publish directly.
export default async function WeeklyCheck({ lang, platformNames }: { lang: "en" | "fr"; platformNames: Record<SocialPlatform, string> }) {
  const fr = lang === "fr";
  const session = await auth();
  const check = await withScopedPrismaClient((db) => getWeeklyCheck(db, session?.user.id));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(fr ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Montreal" }) : "—");
  const mark = (ok: boolean | null) => (ok === true ? "✅" : ok === false ? "⚠️" : "❔");
  return (
    <div className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{fr ? `Publications de la semaine du ${check.weekStart}` : `Posts for the week starting ${check.weekStart}`}</h2>
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
      <ul className="mt-3 divide-y divide-card-border text-sm">
        {check.rows.map((r) => (
          <li key={r.platform} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
            <span className="w-6">{mark(r.ok)}</span>
            <span className="w-28 font-medium text-ink">{platformNames[r.platform]}</span>
            <span className="text-xs text-soft">
              {r.expected != null ? `${fr ? "prévues" : "expected"} ${r.expected} · ` : ""}
              {r.sheet
                ? `${fr ? "Feuille TikTok" : "TikTok sheet"}: ${r.sheet.recent} ${fr ? "ajoutée(s) en 7 jours" : "added in 7 days"} · ${r.sheet.pending} pending`
                : `${r.makeQueued != null ? `Make ${fr ? "en file" : "queued"} ${r.makeQueued}` : "Make —"} · Buffer ${fr ? "en file" : "queued"} ${r.bufferQueued}`}
            </span>
            {r.problem && <span className="w-full pl-10 text-xs text-amber-700">{r.problem}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
