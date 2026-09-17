import { getUpcomingEvents } from "@/lib/google";
import { withScopedPrismaClient } from "@/lib/prisma";
import { getResolvedEventLinks } from "@/lib/calendar-links";
import CalendarCard, { type CalendarLabels } from "./calendar-card";

// `accessToken` is resolved once, sequentially, by the caller — see the
// comment on getUpcomingEvents in src/lib/google.ts for why this can't
// fetch it itself. The link lookup below is the one DB touch inside this
// Suspense boundary; it's the only Suspense-rendered card on the Dashboard
// that touches the database at all, so it isn't racing another one for a
// fresh Hyperdrive connection the way sequential DB reads in the same
// request can.
export default async function CalendarCardServer({
  accessToken,
  lang,
  hour12,
  labels,
}: {
  accessToken: string | null;
  lang: "en" | "fr";
  hour12: boolean;
  labels: CalendarLabels;
}) {
  const events = accessToken ? await getUpcomingEvents(accessToken) : null;
  const links = events && events.length > 0
    ? await withScopedPrismaClient((db) => getResolvedEventLinks(db, events.map((e) => e.id)))
    : {};
  return (
    <CalendarCard
      initial={events}
      links={links}
      connected={accessToken !== null}
      lang={lang}
      hour12={hour12}
      labels={labels}
    />
  );
}
