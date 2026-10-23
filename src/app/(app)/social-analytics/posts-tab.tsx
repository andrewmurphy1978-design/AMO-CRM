import { format } from "date-fns";
import type { Locale } from "date-fns";
import { withScopedPrismaClient } from "@/lib/prisma";
import { SOCIAL_PLATFORMS, SOCIAL_CHART_COLOR, type SocialPlatform } from "@/lib/social";
import PostsRefresh from "./posts-refresh";

type Labels = { statLabels: Record<string, string>; platformNames: Record<SocialPlatform, string>; languageEn: string; languageFr: string };

const SHOW_SENT = 10;

// Recent posts by platform: what is queued (next up first) and what was sent (newest first), each with the results
// Buffer reports for it. Read from the cache that "Refresh from Buffer" fills.
export default async function PostsTab({ platform: only, lang, isAdmin, labels, dateLocale }: { platform: SocialPlatform | null; lang: "en" | "fr"; isAdmin: boolean; labels: Labels; dateLocale: Locale | undefined }) {
  const fr = lang === "fr";
  const posts = await withScopedPrismaClient((db) => db.socialPost.findMany({ where: only ? { platform: only } : {}, orderBy: { postedAt: "desc" }, take: 600 }));
  const latest = posts.reduce((m, p) => Math.max(m, p.fetchedAt.getTime()), 0);
  const when = (d: Date | null) => (d ? format(d, "MMM d, yyyy · HH:mm", { locale: dateLocale }) : "—");

  return (
    <div className="space-y-6">
      <PostsRefresh latestFetch={latest} isAdmin={isAdmin} lang={lang} />
      {posts.length === 0 && (
        <p className="rounded-2xl border border-card-border bg-card-bg p-5 text-sm text-soft">
          {fr ? "Aucune publication pour le moment. Elles sont lues depuis Buffer (publiées et en file d'attente)." : "No posts yet. They are read from Buffer (sent and queued)."}
        </p>
      )}
      {SOCIAL_PLATFORMS.filter((p) => !only || p === only).map((platform) => {
        const mine = posts.filter((p) => p.platform === platform);
        if (mine.length === 0) return null;
        const queued = mine.filter((p) => p.status === "QUEUED").sort((a, b) => (a.postedAt?.getTime() ?? 0) - (b.postedAt?.getTime() ?? 0));
        const sent = mine.filter((p) => p.status === "SENT").sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0)).slice(0, SHOW_SENT);
        const Row = ({ p }: { p: (typeof mine)[number] }) => {
          const metrics = Object.entries((p.metrics as Record<string, number> | null) ?? {}).filter(([, v]) => typeof v === "number");
          return (
            <li className="space-y-1.5 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
                <span className="rounded bg-black/5 px-1.5 py-0.5 font-semibold">{p.language === "FR" ? labels.languageFr : labels.languageEn}</span>
                <span>{when(p.postedAt)}</span>
                {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer" className="ml-auto font-semibold text-amo-lime hover:underline">{fr ? "Voir" : "View"} ↗</a>}
              </div>
              <p className="whitespace-pre-line break-words text-sm text-ink">{(p.text ?? "").slice(0, 280) || (fr ? "(sans texte)" : "(no text)")}{(p.text ?? "").length > 280 ? "…" : ""}</p>
              {p.status === "SENT" && (
                <div className="flex flex-wrap gap-1.5">
                  {metrics.length === 0 ? (
                    <span className="text-xs text-soft">{fr ? "Pas encore de statistiques" : "No stats yet"}</span>
                  ) : (
                    metrics.map(([k, v]) => (
                      <span key={k} className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-ink">
                        {labels.statLabels[k] ?? k}: <strong>{Math.round(v * 100) / 100}</strong>
                      </span>
                    ))
                  )}
                </div>
              )}
            </li>
          );
        };
        return (
          <div key={platform} className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
            <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: SOCIAL_CHART_COLOR[platform] }} />
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SOCIAL_CHART_COLOR[platform] }} />
              {labels.platformNames[platform]}
              <span className="text-xs font-normal text-soft">{queued.length} {fr ? "en file" : "queued"} · {sent.length} {fr ? "publiées" : "sent"}</span>
            </h2>
            {queued.length > 0 && (
              <>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-soft">{fr ? "En file d'attente" : "Queued"}</h3>
                <ul className="divide-y divide-card-border">{queued.map((p) => <Row key={p.id} p={p} />)}</ul>
              </>
            )}
            {sent.length > 0 && (
              <>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-soft">{fr ? "Publiées récemment" : "Recently sent"}</h3>
                <ul className="divide-y divide-card-border">{sent.map((p) => <Row key={p.id} p={p} />)}</ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
