import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { APP_TIME_ZONE } from "@/lib/user-timezone";
import Card, { type CardColor } from "@/components/section-card";
import { BRIEFING_SECTIONS, briefingSummary, buildDailyBriefing, type BriefingItem, type BriefingSectionKey } from "@/lib/daily-briefing";
import PageHeader from "../page-header";
import BriefingIcon from "../briefing-icon";

const COLORS: Record<BriefingSectionKey, CardColor> = {
  emails: "contact",
  sms: "voip",
  events: "calendarEvents",
  contacts: "general",
  tasks: "tasks",
  projects: "projects",
  affiliates: "marketingPending",
  videos: "mockups",
  social: "social",
  automations: "credentials",
  posts: "marketingNoProgram",
  invoices: "invoices",
  proposals: "proposals",
  accounting: "statistics",
};

function ItemRow({ item }: { item: BriefingItem }) {
  const body = (
    <>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.urgent ? "bg-red-500" : "bg-card-border"}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
        {item.detail && <span className="block truncate text-xs text-soft">{item.detail}</span>}
      </span>
    </>
  );
  const cls = "flex items-start gap-2 px-2 py-1.5 hover:bg-black/[0.03] sm:px-3";
  return (
    <li>
      {item.external ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={cls}>
          {body}
        </a>
      ) : (
        <Link href={item.url} className={cls}>
          {body}
        </Link>
      )}
    </li>
  );
}

// Admin-only, like the morning push it mirrors (src/lib/daily-briefing.ts): it spans the whole business.
export default async function BriefingPage() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/");
  const lang = await getLang();
  const t = getDict(lang);
  const tb = t.briefing;

  const { hour12, briefing } = await withScopedPrismaClient(async (db) => {
    const hour12 = await getHour12(session, db);
    const accessToken = await getValidAccessToken(session.user.id, db).catch(() => null);
    const briefing = await buildDailyBriefing(db, { id: session.user.id, language: lang === "fr" ? "FR" : "EN" }, accessToken);
    return { hour12, briefing };
  });

  const shown = BRIEFING_SECTIONS.filter((k) => briefing.sections[k].length > 0 || briefing.notes[k]);
  const clear = BRIEFING_SECTIONS.filter((k) => !shown.includes(k));
  const summary = briefingSummary(briefing, lang);
  const updated = new Date(briefing.generatedAt).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });

  return (
    <div className="flex flex-col gap-2 sm:gap-6">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            <BriefingIcon />
            <span className="truncate">{tb.title}</span>
          </span>
        }
        hour12={hour12}
        lang={lang}
        location={t.dashboard.myLocation}
      />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-soft">{tb.subtitle}</p>
        <span className="ml-auto rounded-full bg-amo-lime/15 px-3 py-1.5 text-sm font-semibold text-emerald-800">{tb.generated.replace("{time}", updated)}</span>
      </div>
      {summary && <p className="rounded-xl border border-card-border bg-card-bg px-4 py-3 text-sm font-medium text-ink">{summary}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {shown.map((k) => (
          <Card
            key={k}
            color={COLORS[k]}
            title={
              <>
                {tb.sectionTitles[k]}
                {briefing.sections[k].length > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/25 px-1.5 text-xs font-semibold normal-case">{briefing.sections[k].length}</span>
                )}
              </>
            }
          >
            <div className="-m-4 p-2 sm:m-0 sm:p-0">
              {briefing.sections[k].length > 0 && (
                <ul className="max-h-96 divide-y divide-card-border overflow-y-auto">
                  {briefing.sections[k].map((item, i) => (
                    <ItemRow key={i} item={item} />
                  ))}
                </ul>
              )}
              {briefing.notes[k] && <p className={`text-xs text-soft ${briefing.sections[k].length > 0 ? "mt-2 px-2 sm:px-3" : ""}`}>{briefing.notes[k]}</p>}
            </div>
          </Card>
        ))}
      </div>

      {clear.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-card-border bg-card-bg px-4 py-3">
          <span className="text-sm font-semibold text-emerald-700">✓ {tb.allClear}:</span>
          {clear.map((k) => (
            <span key={k} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
              {tb.sectionTitles[k]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
