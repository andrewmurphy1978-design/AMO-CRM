import Link from "next/link";
import { getPostsOverview, type OverviewPost } from "@/lib/posts-overview";
import PostsIcon from "./posts-icon";
import { POSTS_CARD_ACCENT_BAR, POSTS_CARD_BG } from "./posts-summary-colors";
import { PlatformIcon, ROW_STYLE } from "./social-card";
import type { SocialPlatform } from "@/lib/social";

export interface PostsDetailLabels {
  title: string;
  queue: string;
  sent: string;
  emptyQueue: string;
  emptySent: string;
  all: string;
  makeUnreadable: string;
  platformNames: Record<SocialPlatform, string>;
  languageEn: string;
  languageFr: string;
}

const SHOWN = 50;

// "Tuesday, October 27, 2026 · 9:00 AM" / "Mardi, 27 octobre 2026 · 09:00", in Québec local time.
function postWhen(d: Date | null, fr: boolean, hour12: boolean): string {
  if (!d) return "—";
  const locale = fr ? "fr-CA" : "en-US";
  const weekday = d.toLocaleDateString(locale, { weekday: "long", timeZone: "America/Montreal" });
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "America/Montreal" });
  const time = d.toLocaleTimeString(locale, { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12, timeZone: "America/Montreal" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${date} · ${time}`;
}

function Row({ post, queued, fr, hour12, labels }: { post: OverviewPost; queued: boolean; fr: boolean; hour12: boolean; labels: PostsDetailLabels }) {
  const style = post.platform === "tiktok" ? { ...ROW_STYLE.tiktok, iconBg: "bg-black", iconFill: "#fff" } : ROW_STYLE[post.platform];
  return (
    <li className="flex items-start gap-2 py-2">
      <PlatformIcon platform={post.platform} style={style} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-soft">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${post.language === "EN" ? "bg-red-100 text-red-800" : "bg-sky-100 text-sky-800"}`}>
            {post.language === "EN" ? labels.languageEn : labels.languageFr}
          </span>
          {queued && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${post.source === "make" ? "bg-[#6D00CC]" : "bg-[#2C4BFF]"}`}>{post.source === "make" ? "Make" : "Buffer"}</span>
          )}
          <span>{postWhen(post.postedAt, fr, hour12)}</span>
        </div>
        <p className="mt-0.5 line-clamp-2 break-words text-sm text-ink">{post.text || (fr ? "(sans texte)" : "(no text)")}</p>
      </div>
    </li>
  );
}

function Section({ title, count, headerBg, posts, queued, empty, fr, hour12, labels }: { title: string; count: number; headerBg: string; posts: OverviewPost[]; queued: boolean; empty: string; fr: boolean; hour12: boolean; labels: PostsDetailLabels }) {
  return (
    <section className="overflow-hidden rounded-xl border border-card-border">
      {/* Same look as the categories of the Email page. */}
      <div className={`flex items-center gap-2 px-3 py-2 ${headerBg}`}>
        <h3 className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-white">{title}</h3>
        <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-xs font-semibold text-white">{count}</span>
      </div>
      <div className="max-h-80 overflow-y-auto bg-card-bg px-3">
        {posts.length === 0 ? (
          <p className="py-3 text-sm text-soft">{empty}</p>
        ) : (
          <ul className="divide-y divide-card-border">
            {posts.map((p) => (
              <Row key={p.id} post={p} queued={queued} fr={fr} hour12={hour12} labels={labels} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// Dashboard "Post Details": the next posts waiting (Make and Buffer) and the latest sent, across every platform.
export default async function PostsDetailCard({ lang, hour12, labels }: { lang: "en" | "fr"; hour12: boolean; labels: PostsDetailLabels }) {
  const fr = lang === "fr";
  const o = await getPostsOverview();
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-card-border p-2 shadow-sm sm:p-5 ${POSTS_CARD_BG}`}>
      <div className={`absolute inset-x-0 top-0 h-[3px] ${POSTS_CARD_ACCENT_BAR}`} />
      <div className="flex items-center gap-2">
        <PostsIcon />
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <Link href="/social-analytics?tab=posts" className="ml-auto text-xs font-semibold text-amo-lime hover:underline">
          {labels.all} →
        </Link>
      </div>
      {o.makeError && <p className="mt-2 text-xs text-amber-700">{labels.makeUnreadable} {o.makeError}</p>}
      <div className="mt-3 space-y-3">
        <Section title={labels.queue} count={o.makeQueued + o.bufferQueued} headerBg="bg-amber-500" posts={o.queued.slice(0, SHOWN)} queued empty={labels.emptyQueue} fr={fr} hour12={hour12} labels={labels} />
        <Section title={labels.sent} count={o.sentLast28} headerBg="bg-emerald-500" posts={o.sent.slice(0, SHOWN)} queued={false} empty={labels.emptySent} fr={fr} hour12={hour12} labels={labels} />
      </div>
    </div>
  );
}
