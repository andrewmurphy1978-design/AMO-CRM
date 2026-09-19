"use client";

import { useEffect, useState } from "react";
import type { EmailSummary, CalendarEventSummary } from "@/lib/google";
import type { WatchedPerson } from "@/lib/personal-watch";
import { isStale } from "@/lib/staleness";
import RefreshButton from "../refresh-button";
import EmailTime from "../email/email-time";
import PersonalEventTime from "./personal-event-time";

interface Buckets {
  emailsByPerson: Record<string, EmailSummary[]>;
  eventsByPerson: Record<string, CalendarEventSummary[]>;
  fetchedAt: string;
}

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

export default function PersonalView({
  people,
  initialBuckets,
  connected,
  hour12,
  intlLocale,
  labels,
}: {
  people: WatchedPerson[];
  initialBuckets: Buckets | null;
  connected: boolean;
  hour12: boolean;
  intlLocale: string;
  labels: {
    emailsHeading: string;
    eventsHeading: string;
    noMatches: string;
    refresh: string;
    refreshing: string;
    screening: string;
  };
}) {
  const [buckets, setBuckets] = useState(initialBuckets);
  const [loading, setLoading] = useState(() => connected && (!initialBuckets || isStale(initialBuckets.fetchedAt)));

  async function runRefresh() {
    try {
      const res = await fetch("/api/personal/inbox", { method: "POST" });
      if (res.ok) setBuckets((await res.json()) as Buckets);
    } catch {
      // Keep showing the last known data rather than clearing it.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Runs once on mount: either there's no cache yet, or what's cached is
    // older than the stale window — both cases silently refresh in the
    // background while the (possibly stale) cached view stays on screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connected && (!initialBuckets || isStale(initialBuckets.fetchedAt))) runRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    await runRefresh();
  }

  if (loading && !buckets) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-card-border bg-card-bg px-5 py-8 text-sm text-soft shadow-sm">
        {labels.screening}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <RefreshButton onClick={refresh} loading={loading} label={labels.refresh} loadingLabel={labels.refreshing} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {people.map((p) => (
          <PersonCard
            key={p.id}
            person={p}
            emails={buckets?.emailsByPerson[p.id] ?? []}
            events={buckets?.eventsByPerson[p.id] ?? []}
            emailsHeading={labels.emailsHeading}
            eventsHeading={labels.eventsHeading}
            noMatches={labels.noMatches}
            hour12={hour12}
            intlLocale={intlLocale}
          />
        ))}
      </div>
    </div>
  );
}
