import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withScopedPrismaClient } from "@/lib/prisma";
import {
  getValidAccessToken,
  searchEmailsForAddresses,
  getUpcomingEvents,
  type EmailSummary,
  type CalendarEventSummary,
} from "@/lib/google";
import { getWatchedPeople, isPersonalSectionUser, matchPeopleByAddress, matchPeopleByRawHeader, type WatchedPerson } from "@/lib/personal-watch";
import { getHour12 } from "@/lib/time-format";
import { getLang } from "@/lib/i18n/get-lang";
import { getDict } from "@/lib/i18n/dictionaries";
import { getDateLocale } from "@/lib/i18n/date-locale";
import PageHeader from "../page-header";
import EmailTime from "../email/email-time";
import PersonalEventTime from "./personal-event-time";

function PersonCard({
  person,
  emails,
  events,
  emailsHeading,
  eventsHeading,
  noMatches,
  hour12,
  intlLocale,
}: {
  person: WatchedPerson;
  emails: EmailSummary[];
  events: CalendarEventSummary[];
  emailsHeading: string;
  eventsHeading: string;
  noMatches: string;
  hour12: boolean;
  intlLocale: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-card-border bg-card-bg p-5 shadow-sm">
      <div className="absolute inset-x-0 top-0 h-[3px] amo-card-accent" />
      <h2 className="font-display text-lg font-semibold text-ink">{person.name}</h2>

      {emails.length === 0 && events.length === 0 ? (
        <p className="mt-3 text-sm text-soft">{noMatches}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {events.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">{eventsHeading}</h3>
              <ul className="space-y-1">
                {events.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-3 text-sm">
                    {ev.htmlLink ? (
                      <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-ink hover:opacity-80">
                        {ev.title}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-ink">{ev.title}</span>
                    )}
                    <span className="shrink-0 whitespace-nowrap text-xs text-soft">
                      {ev.start && <PersonalEventTime iso={ev.start} allDay={ev.allDay} hour12={hour12} intlLocale={intlLocale} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {emails.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-soft">{emailsHeading}</h3>
              <ul className="space-y-1">
                {emails.map((email) => (
                  <li key={email.id} className="flex items-center gap-3 text-sm">
                    <a href={email.link} target="_blank" rel="noopener noreferrer" className="w-28 shrink-0 truncate text-ink hover:opacity-80">
                      {email.from}
                    </a>
                    <a href={email.link} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-soft hover:opacity-80">
                      {email.subject}
                    </a>
                    <span className="shrink-0 whitespace-nowrap text-xs text-soft">
                      <EmailTime iso={email.date} hour12={hour12} intlLocale={intlLocale} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default async function PersonalPage() {
  const session = await auth();
  if (!session || !isPersonalSectionUser(session.user.email)) {
    redirect("/");
  }

  const lang = await getLang();
  const t = getDict(lang);
  const dateLocale = getDateLocale(lang);
  const intlLocale = lang === "fr" ? "fr-CA" : "en-US";

  const { hour12, people, accessToken } = await withScopedPrismaClient(async (db) => {
    const accessToken = await getValidAccessToken(session.user.id, db);
    const hour12 = await getHour12(session, db);
    const people = await getWatchedPeople(db);
    return { hour12, people, accessToken };
  });

  const allAddresses = people.flatMap((p) => p.emails.map((e) => e.email));
  const [emails, events] = accessToken
    ? await Promise.all([searchEmailsForAddresses(accessToken, allAddresses, { maxResults: 40 }), getUpcomingEvents(accessToken)])
    : [null, null];

  const emailsByPerson = new Map<string, EmailSummary[]>(people.map((p) => [p.id, []]));
  const eventsByPerson = new Map<string, CalendarEventSummary[]>(people.map((p) => [p.id, []]));

  for (const e of emails ?? []) {
    const matched = new Set([...matchPeopleByAddress(people, e.fromEmail), ...matchPeopleByRawHeader(people, e.toRaw)]);
    for (const p of matched) emailsByPerson.get(p.id)?.push(e);
  }
  for (const ev of events ?? []) {
    const matched = new Set(ev.attendeeEmails.flatMap((addr) => matchPeopleByAddress(people, addr)));
    for (const p of matched) eventsByPerson.get(p.id)?.push(ev);
  }

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
        <div className="grid gap-5 sm:grid-cols-2">
          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              emails={emailsByPerson.get(p.id) ?? []}
              events={eventsByPerson.get(p.id) ?? []}
              emailsHeading={t.personal.emailsHeading}
              eventsHeading={t.personal.eventsHeading}
              noMatches={t.personal.noMatches}
              hour12={hour12}
              intlLocale={intlLocale}
            />
          ))}
        </div>
      )}
    </div>
  );
}
