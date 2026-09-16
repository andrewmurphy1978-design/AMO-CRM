import { getUpcomingEvents } from "@/lib/google";
import CalendarCard, { type CalendarLabels } from "./calendar-card";

// `accessToken` is resolved once, sequentially, by the caller — see the
// comment on getUpcomingEvents in src/lib/google.ts for why this can't
// fetch it itself.
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
  return <CalendarCard initial={events} connected={accessToken !== null} lang={lang} hour12={hour12} labels={labels} />;
}
