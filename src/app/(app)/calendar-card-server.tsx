import { getGoogleConnection, getUpcomingEvents } from "@/lib/google";
import CalendarCard, { type CalendarLabels } from "./calendar-card";

export default async function CalendarCardServer({ lang, labels }: { lang: "en" | "fr"; labels: CalendarLabels }) {
  const connection = await getGoogleConnection();
  const events = connection ? await getUpcomingEvents() : null;
  return <CalendarCard initial={events} connected={!!connection} lang={lang} labels={labels} />;
}
