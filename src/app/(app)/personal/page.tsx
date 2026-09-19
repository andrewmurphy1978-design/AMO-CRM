import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/google";
import { getWatchedPeople, getCachedPersonalInbox, bucketPersonalInbox, isPersonalSectionUser } from "@/lib/personal-watch";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";
import PersonalView from "./personal-view";

export default async function PersonalPage() {
  const session = await auth();
  if (!session || !isPersonalSectionUser(session.user.email)) {
    redirect("/");
  }

  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  // One shared client — reads the last-fetched snapshot straight from the
  // DB (see PersonalInboxCache) instead of hitting Gmail on every page
  // load; only the client-side Refresh button (a first-ever visit, or the
  // cache going stale) spends a live Gmail call, via /api/personal/inbox.
  const { hour12, people, accessToken, initialBuckets } = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    const hour12 = await getHour12(session, db);
    const people = await getWatchedPeople(db);

    let initialBuckets: { emailsByPerson: ReturnType<typeof bucketPersonalInbox>["emailsByPerson"]; eventsByPerson: ReturnType<typeof bucketPersonalInbox>["eventsByPerson"]; fetchedAt: string } | null = null;
    if (accessToken) {
      const snapshot = await getCachedPersonalInbox(db, session.user.id);
      if (snapshot) {
        const buckets = bucketPersonalInbox(people, snapshot);
        initialBuckets = { ...buckets, fetchedAt: snapshot.fetchedAt };
      }
    }

    return { hour12, people, accessToken, initialBuckets };
  });

  return (
    <div className="space-y-6">
      <PageHeader title={t.personal.title} hour12={hour12} dateLocale={dateLocale} location={t.dashboard.myLocation} />
      <p className="text-sm text-soft">{t.personal.subtitle}</p>

      {!accessToken ? (
        <p className="text-sm text-soft">
          {t.email.notConnected}{" "}
          <Link href="/settings" className="font-semibold text-emerald-700 underline">
            {t.email.connectInSettings}
          </Link>
        </p>
      ) : (
        <PersonalView
          people={people}
          initialBuckets={initialBuckets}
          connected={accessToken !== null}
          hour12={hour12}
          intlLocale={intlLocale}
          labels={{
            emailsHeading: t.personal.emailsHeading,
            eventsHeading: t.personal.eventsHeading,
            noMatches: t.personal.noMatches,
            refresh: t.email.refresh,
            refreshing: t.email.refreshing,
            screening: t.email.screening,
          }}
        />
      )}
    </div>
  );
}
