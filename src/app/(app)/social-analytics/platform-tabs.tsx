import Link from "next/link";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social";
import { PlatformIcon, ROW_STYLE, type RowStyle } from "../social-card";

// The six platform tabs, each with its real brand colour (Instagram's gradient, TikTok in black with a white mark…).
// Summary comes first (all platforms: the overview on Analytics, the weekly posts summary on Posts); choosing a platform
// narrows the current tab to it.
const TAB_STYLE: Record<SocialPlatform, RowStyle> = { ...ROW_STYLE, tiktok: { ...ROW_STYLE.tiktok, iconBg: "bg-black", iconFill: "#fff" } };
const ACCENT: Record<SocialPlatform, string> = { facebook: "#1877F2", instagram: "#DD2A7B", linkedin: "#0A66C2", tiktok: "#000000", x: "#000000", youtube: "#FF0000" };

export default function PlatformTabs({ active, tab, names, summaryLabel }: { active: SocialPlatform | null; tab: "analytics" | "posts"; names: Record<SocialPlatform, string>; summaryLabel: string }) {
  const href = (platform: SocialPlatform | null) => {
    const q = new URLSearchParams();
    if (tab === "posts") q.set("tab", "posts");
    if (platform) q.set("platform", platform);
    const s = q.toString();
    return `/social-analytics${s ? `?${s}` : ""}`;
  };
  return (
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Platforms">
      <Link
        href={href(null)}
        prefetch={false}
        aria-current={active === null ? "page" : undefined}
        className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${active === null ? "bg-card-bg text-ink shadow-sm" : "border-card-border bg-card-bg/60 text-soft hover:text-ink"}`}
        style={active === null ? { borderColor: "#64748b", boxShadow: "inset 0 -3px 0 #64748b" } : undefined}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-600 text-white">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
          </svg>
        </span>
        {summaryLabel}
      </Link>
      {SOCIAL_PLATFORMS.map((p) => {
        const on = active === p;
        return (
          <Link
            key={p}
            href={href(p)}
            prefetch={false}
            aria-current={on ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors ${on ? "bg-card-bg text-ink shadow-sm" : "border-card-border bg-card-bg/60 text-soft hover:text-ink"}`}
            style={on ? { borderColor: ACCENT[p], boxShadow: `inset 0 -3px 0 ${ACCENT[p]}` } : undefined}
          >
            <PlatformIcon platform={p} style={TAB_STYLE[p]} />
            {names[p]}
          </Link>
        );
      })}
    </nav>
  );
}
