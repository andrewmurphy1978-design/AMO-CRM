import clsx from "@/lib/clsx";
import { SOCIAL_PLATFORMS, SOCIAL_LANGUAGES, socialLinkKey, type SocialPlatform } from "@/lib/social";
import { PlatformIcon, ROW_STYLE } from "../social-card";

// One clickable pill per configured platform+language "social page" URL
// (set in Settings — see social-links-form.tsx) — a platform+language with
// no URL yet renders as a plain, unclickable pill instead of being hidden,
// so it still shows up as something to go fill in.
export default function SocialPageLinks({
  links,
  platformNames,
  languageEn,
  languageFr,
  notSetLabel,
}: {
  links: Record<string, string>;
  platformNames: Record<SocialPlatform, string>;
  languageEn: string;
  languageFr: string;
  notSetLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SOCIAL_PLATFORMS.map((platform) => {
        const style = ROW_STYLE[platform];
        return (
          <div key={platform} className={clsx("flex items-center gap-2 rounded-lg px-2 py-2", style.rowBg)}>
            <PlatformIcon platform={platform} style={style} />
            <div className="min-w-0 flex-1">
              <p className={clsx("truncate text-xs font-semibold", style.text)}>{platformNames[platform]}</p>
              <div className="mt-0.5 flex items-center gap-2">
                {SOCIAL_LANGUAGES.map((language) => {
                  const url = links[socialLinkKey(platform, language)];
                  const label = language === "EN" ? languageEn : languageFr;
                  return url ? (
                    <a
                      key={language}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={clsx(
                        "rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline",
                        style.text,
                      )}
                    >
                      {label}
                    </a>
                  ) : (
                    <span
                      key={language}
                      title={notSetLabel}
                      className={clsx("rounded-full bg-white/30 px-2 py-0.5 text-[11px]", style.soft)}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
