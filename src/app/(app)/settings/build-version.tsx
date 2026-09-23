"use client";

import { format } from "date-fns";
import { getDateLocale } from "@/lib/i18n/date-locale";
import type { Lang } from "@/lib/i18n/dictionaries";

// The Settings page itself is a Server Component, but formatting the
// build timestamp needs to run in the *browser* to show the visitor's own
// local time — on Cloudflare Workers there's no meaningful local
// timezone, so doing this server-side rendered the deploy time in UTC
// for everyone regardless of where they actually are (same fix already
// applied to EmailTime/DateTimeCard for the same reason).
export default function BuildVersion({
  buildSha,
  buildTimeIso,
  lang,
  versionLabel,
  localBuildLabel,
  deployedAtPrefix,
}: {
  buildSha: string | null;
  buildTimeIso: string | null;
  lang: Lang;
  versionLabel: string;
  localBuildLabel: string;
  // A plain string, not a `(date) => string` function — Server Components
  // can't pass functions as props to Client Components at all (Next.js
  // throws), so the "Deployed"/"Déployée le" prefix and the client-
  // formatted date get composed here instead of via a dictionary function.
  deployedAtPrefix: string;
}) {
  const dateLocale = getDateLocale(lang);
  const buildTime = buildTimeIso ? new Date(buildTimeIso) : null;

  return (
    <p className="mt-3 font-mono text-xs text-soft">
      {versionLabel}: {buildSha ?? localBuildLabel}
      {buildTime && ` · ${deployedAtPrefix} ${format(buildTime, "PPp", { locale: dateLocale })}`}
    </p>
  );
}
