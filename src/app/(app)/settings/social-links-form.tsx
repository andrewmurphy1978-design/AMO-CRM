"use client";

import { useActionState } from "react";
import { saveSocialLinks } from "@/actions/social-links";
import { SOCIAL_PLATFORMS, SOCIAL_LANGUAGES, socialLinkKey, type SocialPlatform } from "@/lib/social";
import { getDict, type Lang } from "@/lib/i18n/dictionaries";

const FIELD_CLASS =
  "mt-1 w-full rounded-md border border-card-border bg-field-bg px-3 py-2 text-sm text-ink shadow-sm focus:border-amo-gold focus:outline-none focus:ring-2 focus:ring-amo-gold/30";

export default function SocialLinksForm({
  initialLinks,
  platformNames,
  lang,
}: {
  initialLinks: Record<string, string>;
  platformNames: Record<SocialPlatform, string>;
  lang: Lang;
}) {
  const t = getDict(lang);
  const [state, formAction, pending] = useActionState(saveSocialLinks, undefined);

  return (
    <form action={formAction} className="mt-3 space-y-3">
      {SOCIAL_PLATFORMS.map((platform) => (
        <div key={platform} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[7rem_1fr_1fr]">
          <p className="text-sm font-medium text-ink sm:pb-2">{platformNames[platform]}</p>
          {SOCIAL_LANGUAGES.map((language) => {
            const key = socialLinkKey(platform, language);
            return (
              <div key={key}>
                <label className="block text-[10px] font-semibold uppercase tracking-wide text-soft">
                  {language === "EN" ? t.dashboard.socialLanguageEn : t.dashboard.socialLanguageFr}
                </label>
                <input
                  type="url"
                  name={key}
                  defaultValue={initialLinks[key] ?? ""}
                  placeholder="https://..."
                  className={FIELD_CLASS}
                />
              </div>
            );
          })}
        </div>
      ))}

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && <p className="text-sm text-emerald-700">{state.success}</p>}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
      >
        {pending ? t.common.saving : t.common.save}
      </button>
    </form>
  );
}
