"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { AffiliateProgramTab } from "@prisma/client";
import { getDateLocale } from "@/lib/i18n/date-locale";
import { getDict } from "@/lib/i18n/dictionaries";
import {
  statusStyle,
  shortStatusLabel,
  affiliateTabTitle,
} from "@/lib/affiliate-status";
import {
  AFFILIATE_CARD_ACCENT_BAR,
  AFFILIATE_CARD_BG,
} from "./affiliate-summary-colors";
import AffiliateProgramsIcon from "./affiliate-programs-icon";

export interface PendingAffiliateProgramRow {
  id: string;
  tab: AffiliateProgramTab;
  name: string;
  type: string | null;
  iconUrl: string | null;
  affiliateStatus: string | null;
  followUpNeeded: boolean;
  followUpDate: Date | string | null;
}

export interface PendingAffiliateProgramsLabels {
  title: string;
  noneYet: string;
}

export default function PendingAffiliateProgramsCard({
  id,
  programs,
  lang,
  labels,
}: {
  // Desktop and mobile each render their own instance of this card (see
  // page.tsx) since desktop needs it directly below Email in the grid
  // while mobile needs it after the Tasks card in the single-column
  // stack — two DOM positions a single grid item can't satisfy at once.
  // Each instance needs its own id so the Summary card's scroll target
  // never collides with a duplicate id.
  id: string;
  programs: PendingAffiliateProgramRow[];
  lang: "en" | "fr";
  labels: PendingAffiliateProgramsLabels;
}) {
  const router = useRouter();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);

  return (
    <div
      id={id}
      className={`relative flex scroll-mt-20 flex-col overflow-hidden rounded-2xl border border-card-border p-2 shadow-sm sm:p-5 ${AFFILIATE_CARD_BG}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[3px] ${AFFILIATE_CARD_ACCENT_BAR}`}
      />
      {/* Same click-boundary convention as EmailCard/NewContactsCard: the
          whole card navigates to /marketing except for the rows themselves,
          which stop propagation and each link to their own program. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push("/marketing")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") router.push("/marketing");
        }}
        className="contents cursor-pointer"
      >
        <div className="relative flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <AffiliateProgramsIcon />
            <h2 className="font-display text-lg font-semibold text-ink">
              {labels.title}
            </h2>
          </div>
        </div>

        {programs.length === 0 ? (
          <p className="mt-1.5 sm:mt-3 text-sm text-soft">{labels.noneYet}</p>
        ) : (
          <div
            className="mt-1.5 divide-y divide-card-border sm:mt-3"
            onClick={(e) => e.stopPropagation()}
          >
            {programs.map((p) => {
              const styles = statusStyle(p.affiliateStatus);
              const typeLine =
                [affiliateTabTitle(p.tab, t), p.type].filter(Boolean).join(" / ") ||
                "—";
              const followUp = p.followUpNeeded
                ? p.followUpDate
                  ? format(new Date(p.followUpDate), "PP", { locale: dateLocale })
                  : t.marketing.followUpYes
                : t.marketing.followUpNo;
              return (
                <Link
                  key={p.id}
                  href={`/marketing/programs/${p.id}`}
                  className={`block border-l-4 px-2 py-1 ${styles.row} ${styles.border} hover:brightness-95`}
                >
                  <div className="flex items-center gap-2">
                    {p.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.iconUrl}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded-full object-contain"
                      />
                    ) : (
                      <span className="h-5 w-5 shrink-0" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {p.name}
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 truncate rounded-full px-1.5 py-0.5 text-[9px] font-medium ${styles.badge}`}
                    >
                      <span className={`h-1 w-1 shrink-0 rounded-full ${styles.dot}`} />
                      <span className="max-w-[5.5rem] truncate">
                        {shortStatusLabel(p.affiliateStatus)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2 pl-7 text-xs text-ink/70">
                    <span className="min-w-0 flex-1 truncate">{typeLine}</span>
                    <span className="shrink-0">{followUp}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
