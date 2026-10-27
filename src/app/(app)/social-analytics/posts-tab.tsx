import { withScopedPrismaClient } from "@/lib/prisma";
import { SOCIAL_CHART_COLOR, daysAgo, montrealWeekStart, type SocialPlatform } from "@/lib/social";
import { makeClientWith } from "@/lib/automations";
import { BASE, MAKE_QUEUE_STORE_ID } from "@/lib/social-weekly";
import WeeklyCheck from "./weekly-check";

type Labels = { statLabels: Record<string, string>; platformNames: Record<SocialPlatform, string>; languageEn: string; languageFr: string };

const SENT_DAYS = 28; // the Sent sub-card lists the last four weeks

type Item = {
  id: string;
  language: "EN" | "FR";
  postedAt: Date | null;
  text: string | null;
  link: string | null;
  metrics: Record<string, number>;
  source: "buffer" | "make";
};
type Pair = { en: Item | null; fr: Item | null };

const MATCH_WITHIN_MS = 5 * 60 * 1000;

// English and French posts are lined up by their date and time: two posts within five minutes of each other share a
// row; a post without a counterpart sits alone with an empty cell opposite.
function pairByTime(en: Item[], fr: Item[], ascending: boolean): Pair[] {
  const t = (i: Item) => i.postedAt?.getTime() ?? 0;
  const sort = (a: Item[]) => [...a].sort((x, y) => (ascending ? t(x) - t(y) : t(y) - t(x)));
  const a = sort(en);
  const b = sort(fr);
  const out: Pair[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i >= a.length) out.push({ en: null, fr: b[j++] });
    else if (j >= b.length) out.push({ en: a[i++], fr: null });
    else {
      const d = t(a[i]) - t(b[j]);
      if (Math.abs(d) <= MATCH_WITHIN_MS) out.push({ en: a[i++], fr: b[j++] });
      else if (ascending ? d < 0 : d > 0) out.push({ en: a[i++], fr: null });
      else out.push({ en: null, fr: b[j++] });
    }
  }
  return out;
}

// Posts Make publishes itself wait in the Make data store "Social Post Queue" (Facebook, LinkedIn, French Instagram), not in Buffer.
async function makeQueueFor(db: Parameters<Parameters<typeof withScopedPrismaClient>[0]>[0], platform: SocialPlatform): Promise<{ items: Item[]; error: string | null }> {
  if (!["facebook", "linkedin", "instagram"].includes(platform)) return { items: [], error: null };
  try {
    const client = await makeClientWith(db);
    if (!client) return { items: [], error: "Make is not connected in Settings" };
    const records = await client.listDataStoreRecords(MAKE_QUEUE_STORE_ID);
    const items: Item[] = [];
    for (const r of records) {
      if (BASE[String(r.data.platform ?? "").toLowerCase()] !== platform) continue;
      const language = String(r.data.language ?? "").toUpperCase() === "FR" ? "FR" : "EN";
      if (platform === "instagram" && language === "EN") continue; // English Instagram goes through Buffer
      const when = r.data.scheduled_time ? new Date(String(r.data.scheduled_time)) : null;
      items.push({ id: `make-${r.key}`, language, postedAt: when && !Number.isNaN(when.getTime()) ? when : null, text: r.data.message ? String(r.data.message) : null, link: null, metrics: {}, source: "make" });
    }
    return { items, error: null };
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function Cell({ item, sent, fr, when, labels }: { item: Item | null; sent: boolean; fr: boolean; when: (d: Date | null) => string; labels: Labels }) {
  if (!item) return <div className="hidden rounded-xl border border-dashed border-card-border p-3 text-center text-xs text-soft sm:block">—</div>;
  const metrics = Object.entries(item.metrics);
  return (
    <div className="space-y-1.5 rounded-xl border border-card-border bg-card-bg p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
        <span>{when(item.postedAt)}</span>
        {item.source === "make" && <span className="rounded bg-black/5 px-1.5 py-0.5 font-semibold">Make</span>}
        {item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="ml-auto font-semibold text-amo-lime hover:underline">{fr ? "Voir" : "View"} ↗</a>}
      </div>
      <p className="whitespace-pre-line break-words text-sm text-ink">{(item.text ?? "").slice(0, 280) || (fr ? "(sans texte)" : "(no text)")}{(item.text ?? "").length > 280 ? "…" : ""}</p>
      {sent && (
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
    </div>
  );
}

function SubCard({ title, count, badge, pairs, sent, empty, fr, when, labels, byWeek }: { title: string; count: number; badge: string; pairs: Pair[]; sent: boolean; empty: string; fr: boolean; when: (d: Date | null) => string; labels: Labels; byWeek?: boolean }) {
  // Optionally grouped under a heading per week (Monday to Sunday), newest week first.
  const groups: { week: string | null; pairs: Pair[] }[] = [];
  for (const pair of pairs) {
    const at = pair.en?.postedAt ?? pair.fr?.postedAt ?? null;
    const week = byWeek && at ? montrealWeekStart(at) : null;
    const last = groups[groups.length - 1];
    if (last && last.week === week) last.pairs.push(pair);
    else groups.push({ week, pairs: [pair] });
  }
  const weekTitle = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString(fr ? "fr-CA" : "en-US", { dateStyle: "long", timeZone: "UTC" });
  return (
    <section className="rounded-2xl border border-card-border bg-black/[0.02] p-3 sm:p-4">
      <h3 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
        {title}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{count}</span>
      </h3>
      {pairs.length === 0 ? (
        <p className="mt-2 text-sm text-soft">{empty}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="hidden grid-cols-2 gap-3 sm:grid">
            <span className="w-fit rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">{labels.languageEn}</span>
            <span className="w-fit rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800">{labels.languageFr}</span>
          </div>
          {groups.map((g, gi) => (
            <div key={`${g.week ?? "all"}-${gi}`} className="space-y-3">
              {g.week && (
                <h4 className="flex items-center gap-2 border-b border-card-border pb-1 text-xs font-semibold uppercase tracking-wide text-soft">
                  {fr ? "Semaine du" : "Week of"} {weekTitle(g.week)}
                  <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-ink">{g.pairs.reduce((n, p) => n + (p.en ? 1 : 0) + (p.fr ? 1 : 0), 0)}</span>
                </h4>
              )}
              {g.pairs.map((pair, idx) => (
                <div key={`${pair.en?.id ?? "-"}-${pair.fr?.id ?? "-"}-${idx}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {pair.en && <span className="w-fit rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800 sm:hidden">{labels.languageEn}</span>}
                  <Cell item={pair.en} sent={sent} fr={fr} when={when} labels={labels} />
                  {pair.fr && <span className="w-fit rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 sm:hidden">{labels.languageFr}</span>}
                  <Cell item={pair.fr} sent={sent} fr={fr} when={when} labels={labels} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Recent posts for the chosen platform: Queue and Sent sub-cards, English on the left and French on the right with
// matching posts on the same row. Buffer's posts come from the cache that "Refresh from Buffer" fills; Make's queue is
// read live for the platforms Make publishes itself.
export default async function PostsTab({ platform: only, lang, labels, hour12 }: { platform: SocialPlatform | null; lang: "en" | "fr"; labels: Labels; hour12: boolean }) {
  const fr = lang === "fr";
  const { posts, make } = await withScopedPrismaClient(async (db) => {
    const [posts, make] = await Promise.all([
      only
        ? db.socialPost.findMany({
            where: { platform: only, OR: [{ status: "QUEUED" }, { status: "SENT", postedAt: { gte: daysAgo(SENT_DAYS) } }] },
            orderBy: { postedAt: "desc" },
            take: 1500,
          })
        : Promise.resolve([]),
      only ? makeQueueFor(db, only) : Promise.resolve({ items: [] as Item[], error: null as string | null }),
    ]);
    return { posts, make };
  });
  // "Tuesday, October 27, 2026 · 9:00 AM" / "Mardi, 27 octobre 2026 · 09:00", in Québec local time.
  const when = (d: Date | null) => {
    if (!d) return "—";
    const locale = fr ? "fr-CA" : "en-US";
    const weekday = d.toLocaleDateString(locale, { weekday: "long", timeZone: "America/Montreal" });
    const date = d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "America/Montreal" });
    const time = d.toLocaleTimeString(locale, { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12, timeZone: "America/Montreal" });
    return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date} · ${time}`;
  };

  const toItem = (p: (typeof posts)[number]): Item => ({
    id: p.id,
    language: p.language.toUpperCase() === "FR" ? "FR" : "EN",
    postedAt: p.postedAt,
    text: p.text,
    link: p.link,
    metrics: Object.fromEntries(Object.entries((p.metrics as Record<string, number> | null) ?? {}).filter(([, v]) => typeof v === "number")),
    source: "buffer",
  });
  const queuedAll = [...posts.filter((p) => p.status === "QUEUED").map(toItem), ...make.items];
  const sentAll = posts.filter((p) => p.status === "SENT").map(toItem);
  const queuePairs = pairByTime(queuedAll.filter((i) => i.language === "EN"), queuedAll.filter((i) => i.language === "FR"), true);
  const sentPairs = pairByTime(sentAll.filter((i) => i.language === "EN"), sentAll.filter((i) => i.language === "FR"), false);

  return (
    <div className="space-y-6">
      {!only && <WeeklyCheck lang={lang} platformNames={labels.platformNames} />}
      {only && (
        <div className="relative space-y-4 overflow-hidden rounded-2xl border border-card-border bg-card-bg p-3 shadow-sm sm:p-5">
          <div className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: SOCIAL_CHART_COLOR[only] }} />
          {make.error && <p className="text-xs text-amber-700">{fr ? "File d'attente Make illisible : " : "Could not read the Make queue: "}{make.error}</p>}
          <SubCard fr={fr} when={when} labels={labels} title={fr ? "En file d'attente" : "Queue"} count={queuedAll.length} badge="bg-amber-100 text-amber-800" pairs={queuePairs} sent={false} empty={fr ? "Rien en file d'attente." : "Nothing in the queue."} />
          <SubCard fr={fr} when={when} labels={labels} title={fr ? "Publiées (4 dernières semaines)" : "Sent (last 4 weeks)"} count={sentAll.length} badge="bg-emerald-100 text-emerald-800" pairs={sentPairs} sent byWeek empty={fr ? "Aucune publication envoyée au cours des 4 dernières semaines." : "No posts sent in the last 4 weeks."} />
        </div>
      )}
    </div>
  );
}
